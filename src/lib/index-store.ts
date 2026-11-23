import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { toEmbeddingInput, withLineChunks } from "./chunk";
import type { Embedder } from "./embed";
import { loadSampleChunks, loadSampleGlossary } from "./samples";
import type { StoredChunk } from "./search";

/**
 * 検索対象の区切り（ベクトルつき）を読み込む。
 * CHUNKS_TABLE があれば DynamoDB（取り込みLambdaが保存したもの）、なければサンプルをその場で埋め込む（手元で試す用）。
 * DynamoDB は文書の追加・削除を反映するため、60秒だけプロセス内に置いておく。
 */
const CACHE_MS = 60_000;
let cache: { at: number; items: Promise<StoredChunk[]> } | null = null;
let local: Promise<StoredChunk[]> | null = null;

export const usesDynamo = () => Boolean(process.env.CHUNKS_TABLE);

export function getIndexItems(embedder: Embedder, now = Date.now()): Promise<StoredChunk[]> {
  if (!usesDynamo()) {
    if (!local) local = embedSamples(embedder).catch((e) => ((local = null), Promise.reject(e)));
    return local;
  }
  if (!cache || now - cache.at > CACHE_MS) {
    const items = scanTable(process.env.CHUNKS_TABLE!).catch((e) => ((cache = null), Promise.reject(e)));
    cache = { at: now, items };
  }
  return cache.items.then((all) => all.filter((i) => !i.expiresAt || i.expiresAt * 1000 > now));
}

/** 文書を追加・削除したあとに呼ぶ（次の質問から反映される）。 */
export function invalidateIndex(): void {
  cache = null;
}

/** 手元で試すとき用：取り込んだ区切りを足す／文書の区切りを消す。 */
export async function addLocalItems(embedder: Embedder, items: StoredChunk[]): Promise<void> {
  const current = await getIndexItems(embedder);
  local = Promise.resolve([...current.filter((i) => !items.some((n) => n.docId === i.docId)), ...items]);
}
export async function removeLocalDoc(embedder: Embedder, docId: string): Promise<void> {
  const current = await getIndexItems(embedder);
  local = Promise.resolve(current.filter((i) => i.docId !== docId));
}

async function scanTable(table: string): Promise<StoredChunk[]> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const items: StoredChunk[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key }));
    for (const it of res.Items ?? []) {
      if (!Array.isArray(it.vector)) continue;
      items.push({
        docId: it.docId,
        docTitle: it.docTitle,
        heading: it.heading,
        text: it.text,
        chunkId: it.chunkId,
        parentId: it.parentId,
        owner: it.owner,
        expiresAt: it.expiresAt === undefined ? undefined : Number(it.expiresAt),
        vector: (it.vector as number[]).map(Number),
      });
    }
    key = res.LastEvaluatedKey;
  } while (key);
  return items;
}

async function embedSamples(embedder: Embedder): Promise<StoredChunk[]> {
  const chunks = withLineChunks(await loadSampleChunks());
  const glossary = await loadSampleGlossary();
  const items: StoredChunk[] = [];
  for (const c of chunks) items.push({ ...c, vector: await embedder.embed(toEmbeddingInput(c, glossary)) });
  return items;
}

/** その人が使える区切り：サンプル（持ち主なし）と、その人がアップロードした文書。 */
export function visibleTo(items: StoredChunk[], user: string): StoredChunk[] {
  return items.filter((i) => !i.owner || i.owner === user);
}
