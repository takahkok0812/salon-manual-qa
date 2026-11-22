/**
 * 評価用の質問20件で検索の精度を測る。
 *   npm run eval                 … 検索だけ（埋め込みはBedrockのTitan）
 *   npm run eval -- --answer 3   … 先頭3問だけ、実際にAIに回答させて表示（ANSWER_MODEL_ID が必要）
 *   EMBEDDER=local npm run eval  … AWSを呼ばずに試す
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { answerWithEvidence, createAnswerer } from "../src/lib/answer";
import { createEmbedder } from "../src/lib/embed";
import { evaluateQuestion, hitRate, suggestThreshold, type EvalQuestion, type EvalRow } from "../src/lib/evaluate";
import { topK, type StoredChunk } from "../src/lib/search";
import { buildIndex, INDEX_PATH } from "./build-index";

const K = 3;

async function loadIndex(expected: string): Promise<StoredChunk[]> {
  try {
    const saved = JSON.parse(await readFile(INDEX_PATH, "utf8")) as { embedder: string; items: StoredChunk[] };
    if (saved.embedder === expected) return saved.items;
    console.log(`保存済みの索引（${saved.embedder}）と埋め込みが違うので作り直します`);
  } catch {
    console.log("索引がないので作ります");
  }
  return (await buildIndex()).items;
}

async function main() {
  const embedder = createEmbedder();
  const items = await loadIndex(embedder.name);
  const raw = await readFile(path.join(process.cwd(), "samples", "eval", "questions.json"), "utf8");
  const { questions } = JSON.parse(raw) as { questions: EvalQuestion[] };

  const rows: EvalRow[] = [];
  const hitsById = new Map<string, ReturnType<typeof topK>>();
  for (const q of questions) {
    const hits = topK(items, await embedder.embed(q.question), K);
    hitsById.set(q.id, hits);
    rows.push(evaluateQuestion(q, hits));
  }

  console.log(`\n埋め込み：${embedder.name}`);
  console.table(
    rows.map((r) => ({
      id: r.id,
      種類: r.type === "answerable" ? "答えあり" : "記載なし",
      上位3件に正解: r.hit === null ? "-" : r.hit ? `○（${r.rank}位）` : "×",
      最高類似度: r.topScore.toFixed(3),
      "1位": r.top[0],
    })),
  );
  const t = suggestThreshold(rows);
  console.log(`上位${K}件の正解率（答えあり${rows.filter((r) => r.type === "answerable").length}問）：${(hitRate(rows) * 100).toFixed(0)}%`);
  console.log(
    `類似度：答えありの最小 ${t.minAnswerable.toFixed(3)} ／ 記載なしの最大 ${t.maxNoAnswer.toFixed(3)} → しきい値の候補 ${t.threshold ?? "なし（重なっている）"}`,
  );

  const n = Number(process.argv[process.argv.indexOf("--answer") + 1] ?? 0);
  if (process.argv.includes("--answer") && n > 0) {
    const answerer = createAnswerer();
    const threshold = t.threshold ?? 0;
    console.log(`\n回答の確認（${answerer.name}、しきい値 ${threshold}）`);
    for (const q of [...questions.slice(0, n), ...questions.filter((x) => x.type === "no_answer").slice(0, 1)]) {
      const res = await answerWithEvidence(answerer, q.question, hitsById.get(q.id)!, threshold);
      console.log(`\n■ ${q.id} ${q.question}\n${res.text}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
