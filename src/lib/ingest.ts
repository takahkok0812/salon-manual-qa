import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { splitMarkdown, toEmbeddingInput, withLineChunks, type GlossaryTerm } from "./chunk";
import type { Embedder } from "./embed";
import type { StoredChunk } from "./search";

/**
 * 文書の取り込み（分割→埋め込み）の共通部分。取り込みLambdaと、手元で試すときの文書管理で使う。
 *
 * S3 のキーと文書IDの対応：
 *   manuals/01_予約・受付.md            → 01_予約・受付.md（サンプル。全員の質問に使う）
 *   manuals/u/<ユーザーID>/メモ.md      → u/<ユーザーID>/メモ.md（その人の質問にだけ使い、24時間で消える）
 */
export const MANUALS_PREFIX = "manuals/";
export const USER_PREFIX = "u/";
export const USER_DOC_TTL_SECONDS = 24 * 60 * 60;
export const MAX_DOC_CHARS = 30_000;
const NAME_RE = /^[\p{L}\p{N}_\-・（）() ]{1,60}\.(md|txt)$/u;

export function docIdFromKey(key: string): string {
  return key.startsWith(MANUALS_PREFIX) ? key.slice(MANUALS_PREFIX.length) : key;
}

export function ownerOf(docId: string): string | undefined {
  return docId.match(/^u\/([^/]+)\//)?.[1];
}

export function userDocId(owner: string, name: string): string {
  return `${USER_PREFIX}${owner}/${name}`;
}

/** アップロードする文書の名前と中身を確かめる。 */
export function validateUpload(name: unknown, content: unknown): { ok: true; name: string; content: string } | { ok: false; error: string } {
  if (typeof name !== "string" || !NAME_RE.test(name.trim())) {
    return { ok: false, error: "ファイル名は60文字以内で、拡張子は .md か .txt にしてください" };
  }
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "中身が空です" };
  if (content.length > MAX_DOC_CHARS) return { ok: false, error: `中身は${MAX_DOC_CHARS.toLocaleString()}文字以内にしてください` };
  return { ok: true, name: name.trim(), content };
}

/** 分割して埋め込み、保存できる形にする。アップロード文書には持ち主と消える時刻をつける。 */
export async function buildItems(
  docId: string,
  markdown: string,
  embedder: Embedder,
  glossary: GlossaryTerm[] = [],
  now = Date.now(),
): Promise<(StoredChunk & { updatedAt: string })[]> {
  const owner = ownerOf(docId);
  const chunks = withLineChunks(splitMarkdown(docId, markdown));
  const items = [];
  for (const c of chunks) {
    items.push({
      ...c,
      ...(owner ? { owner, expiresAt: Math.floor(now / 1000) + USER_DOC_TTL_SECONDS } : {}),
      vector: await embedder.embed(toEmbeddingInput(c, glossary)),
      updatedAt: new Date(now).toISOString(),
    });
  }
  return items;
}

/** その文書の区切りをすべて消す（作り直しの前と、文書の削除で使う）。件数が少ないので Scan で探す。 */
export async function deleteDocChunks(ddb: DynamoDBDocumentClient, table: string, docId: string): Promise<number> {
  const ids: string[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: key, ProjectionExpression: "chunkId", FilterExpression: "docId = :d", ExpressionAttributeValues: { ":d": docId } }),
    );
    ids.push(...(res.Items ?? []).map((i) => i.chunkId as string));
    key = res.LastEvaluatedKey;
  } while (key);
  for (let i = 0; i < ids.length; i += 25) {
    await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: ids.slice(i, i + 25).map((chunkId) => ({ DeleteRequest: { Key: { chunkId } } })) } }));
  }
  return ids.length;
}
