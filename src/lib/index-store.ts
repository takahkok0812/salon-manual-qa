import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { toEmbeddingInput, withLineChunks } from "./chunk";
import type { Embedder } from "./embed";
import { loadSampleChunks, loadSampleGlossary } from "./samples";
import type { StoredChunk } from "./search";

/**
 * 検索対象の区切り（ベクトルつき）を読み込む。件数が少ないので一度読んだらプロセス内に置いておく。
 * CHUNKS_TABLE があれば DynamoDB（取り込みLambdaが保存したもの）、なければサンプルをその場で埋め込む（手元で試す用）。
 */
let cache: Promise<StoredChunk[]> | null = null;

export function getIndexItems(embedder: Embedder): Promise<StoredChunk[]> {
  if (!cache) {
    cache = (process.env.CHUNKS_TABLE ? scanTable(process.env.CHUNKS_TABLE) : embedSamples(embedder)).catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

async function scanTable(table: string): Promise<StoredChunk[]> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const items: StoredChunk[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key }));
    for (const it of res.Items ?? []) {
      items.push({
        docId: it.docId,
        docTitle: it.docTitle,
        heading: it.heading,
        text: it.text,
        chunkId: it.chunkId,
        parentId: it.parentId,
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
