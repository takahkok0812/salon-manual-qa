/**
 * サンプルのマニュアルを分割・埋め込みして .data/index.json に保存する（手元で試す用）。
 *   npm run index            … Bedrock の Titan で埋め込み（AWSにログイン済みであること）
 *   EMBEDDER=local npm run index … AWSを呼ばずに試す
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toEmbeddingInput, withLineChunks } from "../src/lib/chunk";
import { createEmbedder } from "../src/lib/embed";
import { loadSampleChunks, loadSampleGlossary } from "../src/lib/samples";
import type { StoredChunk } from "../src/lib/search";

export const INDEX_PATH = path.join(process.cwd(), ".data", "index.json");

/** 検索の単位。lines＝見出し＋箇条書き1項目ずつ（既定）、section＝見出しごとだけ（比較用）。 */
export const CHUNK_MODE = process.env.CHUNK_MODE === "section" ? "section" : "lines";

/** 索引の作り方の識別子。設定を変えたら作り直す判定に使う。 */
export function indexMode(): string {
  return `${CHUNK_MODE}${process.env.GLOSSARY === "off" ? "" : "+glossary"}`;
}

export async function buildIndex(): Promise<{ embedder: string; mode: string; items: StoredChunk[] }> {
  const embedder = createEmbedder();
  const sections = await loadSampleChunks();
  const chunks = CHUNK_MODE === "lines" ? withLineChunks(sections) : sections;
  const glossary = await loadSampleGlossary();
  const items: StoredChunk[] = [];
  for (const c of chunks) {
    items.push({ ...c, vector: await embedder.embed(toEmbeddingInput(c, glossary)) });
  }
  return { embedder: embedder.name, mode: indexMode(), items };
}

async function main() {
  const started = Date.now();
  const index = await buildIndex();
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index));
  console.log(`取り込み完了：${index.items.length}件（${index.embedder}、${index.mode}、${((Date.now() - started) / 1000).toFixed(1)}秒）→ ${INDEX_PATH}`);
}

if (process.argv[1]?.endsWith("build-index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
