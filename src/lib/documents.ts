import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { createEmbedder } from "./embed";
import { addLocalItems, getIndexItems, invalidateIndex, removeLocalDoc } from "./index-store";
import { buildItems, deleteDocChunks, MANUALS_PREFIX, userDocId } from "./ingest";
import { loadSampleGlossary } from "./samples";

/**
 * 文書管理（店長だけ）。デモなので、店長がアップロードした文書は「その人の質問にだけ」使い、24時間で消える。
 * サンプルのマニュアル5本は誰も消せない。
 */
export type DocStatus = "done" | "processing" | "failed";
export type DocInfo = { name: string; docId: string; chunks: number; status: DocStatus; uploadedAt?: string; sample: boolean };

/** アップロードから何分たっても区切りがなければ「失敗」とみなすか */
const PROCESSING_GRACE_MS = 3 * 60 * 1000;

export interface DocumentStore {
  list(owner: string): Promise<DocInfo[]>;
  upload(owner: string, name: string, content: string): Promise<void>;
  remove(owner: string, name: string): Promise<boolean>;
}

export function statusOf(chunks: number, uploadedAt: Date | undefined, now = Date.now()): DocStatus {
  if (chunks > 0) return "done";
  if (uploadedAt && now - uploadedAt.getTime() < PROCESSING_GRACE_MS) return "processing";
  return "failed";
}

/** S3 に置き（取り込みLambdaが動く）、区切りの件数で取り込み状況を判断する。 */
export class S3DocumentStore implements DocumentStore {
  private s3 = new S3Client({});
  private ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  constructor(
    private bucket: string,
    private table: string,
  ) {}

  private async counts(): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    let key: Record<string, unknown> | undefined;
    do {
      const res = await this.ddb.send(new ScanCommand({ TableName: this.table, ExclusiveStartKey: key, ProjectionExpression: "docId" }));
      for (const it of res.Items ?? []) m.set(it.docId, (m.get(it.docId) ?? 0) + 1);
      key = res.LastEvaluatedKey;
    } while (key);
    return m;
  }

  private async listKeys(prefix: string, delimiter?: string) {
    const res = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, Delimiter: delimiter }));
    return (res.Contents ?? []).filter((o) => o.Key && /\.(md|txt)$/.test(o.Key));
  }

  async list(owner: string): Promise<DocInfo[]> {
    const [counts, samples, mine] = await Promise.all([
      this.counts(),
      this.listKeys(MANUALS_PREFIX, "/"),
      this.listKeys(`${MANUALS_PREFIX}${userDocId(owner, "")}`),
    ]);
    const toInfo = (key: string, at: Date | undefined, sample: boolean): DocInfo => {
      const docId = key.slice(MANUALS_PREFIX.length);
      const chunks = counts.get(docId) ?? 0;
      return { name: key.split("/").at(-1)!, docId, chunks, status: statusOf(chunks, at), uploadedAt: at?.toISOString(), sample };
    };
    return [...samples.map((o) => toInfo(o.Key!, o.LastModified, true)), ...mine.map((o) => toInfo(o.Key!, o.LastModified, false))];
  }

  async upload(owner: string, name: string, content: string) {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: `${MANUALS_PREFIX}${userDocId(owner, name)}`, Body: content, ContentType: "text/markdown; charset=utf-8" }),
    );
    invalidateIndex();
  }

  async remove(owner: string, name: string) {
    const docId = userDocId(owner, name);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `${MANUALS_PREFIX}${docId}` }));
    await deleteDocChunks(this.ddb, this.table, docId);
    invalidateIndex();
    return true;
  }
}

/** 手元で試すとき用：その場で分割・埋め込みして、プロセス内の検索対象に足す。 */
export class LocalDocumentStore implements DocumentStore {
  private uploaded = new Map<string, { name: string; at: Date; owner: string }>();
  private embedder = createEmbedder();

  async list(owner: string): Promise<DocInfo[]> {
    const items = await getIndexItems(this.embedder);
    const count = (docId: string) => items.filter((i) => i.docId === docId).length;
    const sampleIds = [...new Set(items.filter((i) => !i.owner).map((i) => i.docId))].sort();
    const samples = sampleIds.map((docId) => ({ name: docId, docId, chunks: count(docId), status: "done" as const, sample: true }));
    const mine = [...this.uploaded.entries()]
      .filter(([, v]) => v.owner === owner)
      .map(([docId, v]) => ({ name: v.name, docId, chunks: count(docId), status: statusOf(count(docId), v.at), uploadedAt: v.at.toISOString(), sample: false }));
    return [...samples, ...mine];
  }

  async upload(owner: string, name: string, content: string) {
    const docId = userDocId(owner, name);
    this.uploaded.set(docId, { name, at: new Date(), owner });
    await addLocalItems(this.embedder, await buildItems(docId, content, this.embedder, await loadSampleGlossary()));
  }

  async remove(owner: string, name: string) {
    const docId = userDocId(owner, name);
    if (!this.uploaded.delete(docId)) return false;
    await removeLocalDoc(this.embedder, docId);
    return true;
  }
}

let shared: DocumentStore | null = null;
export function getDocumentStore(): DocumentStore {
  if (!shared) {
    const bucket = process.env.DOCUMENTS_BUCKET;
    const table = process.env.CHUNKS_TABLE;
    shared = bucket && table ? new S3DocumentStore(bucket, table) : new LocalDocumentStore();
  }
  return shared;
}
