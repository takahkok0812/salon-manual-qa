/**
 * サンプルのマニュアルを分割・埋め込みして .data/index.json に保存する（手元で試す用）。
 *   npm run index            … Bedrock の Titan で埋め込み（AWSにログイン済みであること）
 *   EMBEDDER=local npm run index … AWSを呼ばずに試す
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toEmbeddingInput } from "../src/lib/chunk";
import { createEmbedder } from "../src/lib/embed";
import { loadSampleChunks } from "../src/lib/samples";
import type { StoredChunk } from "../src/lib/search";

export const INDEX_PATH = path.join(process.cwd(), ".data", "index.json");

export async function buildIndex(): Promise<{ embedder: string; items: StoredChunk[] }> {
  const embedder = createEmbedder();
  const chunks = await loadSampleChunks();
  const items: StoredChunk[] = [];
  for (const c of chunks) {
    items.push({ ...c, vector: await embedder.embed(toEmbeddingInput(c)) });
  }
  return { embedder: embedder.name, items };
}

async function main() {
  const started = Date.now();
  const index = await buildIndex();
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index));
  console.log(`取り込み完了：${index.items.length}件（${index.embedder}、${((Date.now() - started) / 1000).toFixed(1)}秒）→ ${INDEX_PATH}`);
}

if (process.argv[1]?.endsWith("build-index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
