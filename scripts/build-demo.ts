/**
 * 公開デモ用の回答を、評価用の質問セットから作って .data/demo-answers.json に保存する。
 * 内容を確かめてから src/data/demo-answers.json に写してコミットする（公開デモはAIを呼ばずにそれを表示する。費用0円の方針）。
 *   npm run demo:build   … 埋め込みはTitan、回答は ANSWER_MODEL_ID のモデル（AWSにログイン済みであること）
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerWithEvidence, createAnswerer } from "../src/lib/answer";
import type { DemoAnswer, DemoData } from "../src/lib/demo";
import { createEmbedder } from "../src/lib/embed";
import type { EvalQuestion } from "../src/lib/evaluate";
import { NO_ANSWER } from "../src/lib/prompt";
import { DEFAULT_EVIDENCE_THRESHOLD, hybridSearch } from "../src/lib/search";
import { loadIndex } from "./build-index";

export const DEMO_PATH = path.join(process.cwd(), ".data", "demo-answers.json");
const K = 3;

async function main() {
  const embedder = createEmbedder();
  const answerer = createAnswerer();
  const items = await loadIndex(embedder.name);
  const raw = await readFile(path.join(process.cwd(), "samples", "eval", "questions.json"), "utf8");
  const { questions } = JSON.parse(raw) as { questions: EvalQuestion[] };
  const threshold = Number(process.env.EVIDENCE_THRESHOLD ?? DEFAULT_EVIDENCE_THRESHOLD);

  const out: DemoAnswer[] = [];
  for (const q of questions) {
    const hits = hybridSearch(items, await embedder.embed(q.question), q.question, K);
    const res = await answerWithEvidence(answerer, q.question, hits, threshold);
    const noAnswer = res.text.includes(NO_ANSWER);
    out.push({
      id: q.id,
      kind: q.type,
      question: q.question,
      answer: res.text.trim(),
      decidedBy: res.answered ? "ai" : "filter",
      noAnswer,
      sources: noAnswer ? [] : hits.map((h, i) => ({ n: i + 1, docTitle: h.chunk.docTitle, heading: h.chunk.heading, text: h.chunk.text })),
    });
    console.log(`${q.id} ${noAnswer ? "記載なし" : "回答"}（${res.answered ? "AI" : "ふるい分け"}）${q.question}`);
  }

  const data: DemoData = { generatedAt: new Date().toISOString(), embedder: embedder.name, answerModel: answerer.name, items: out };
  await mkdir(path.dirname(DEMO_PATH), { recursive: true });
  await writeFile(DEMO_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`\n${out.length}問の回答を ${path.relative(process.cwd(), DEMO_PATH)} に保存しました`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
