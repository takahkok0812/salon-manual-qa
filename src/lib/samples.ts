import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { splitMarkdown, type Chunk, type GlossaryTerm } from "./chunk";

export const SAMPLES_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "samples", "manuals");

/** サンプルのマニュアル（samples/manuals/*.md）を読み込んで分割する。 */
export async function loadSampleChunks(dir = SAMPLES_DIR): Promise<Chunk[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const chunks: Chunk[] = [];
  for (const f of files) {
    const md = await readFile(path.join(/*turbopackIgnore: true*/ dir, f), "utf8");
    chunks.push(...splitMarkdown(f, md));
  }
  return chunks;
}

/** サンプルの用語集（samples/glossary.json）。GLOSSARY=off のときは使わない（比較用）。 */
export async function loadSampleGlossary(dir = SAMPLES_DIR): Promise<GlossaryTerm[]> {
  if (process.env.GLOSSARY === "off") return [];
  const raw = await readFile(path.join(/*turbopackIgnore: true*/ dir, "..", "glossary.json"), "utf8");
  return (JSON.parse(raw) as { terms: GlossaryTerm[] }).terms;
}

/** トップページ用の概要。ビルド時に一度だけ読み込む。 */
export async function getSampleSummary(): Promise<{ docTitles: string[]; chunkCount: number }> {
  "use cache";
  const chunks = await loadSampleChunks();
  return { docTitles: [...new Set(chunks.map((c) => c.docTitle))], chunkCount: chunks.length };
}
