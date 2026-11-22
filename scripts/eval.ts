/**
 * 評価用の質問20件で検索の精度を測る。
 *   npm run eval                 … 検索だけ（埋め込みはBedrockのTitan）
 *   npm run eval -- --answer 3   … 答えありの先頭3問と記載なしの全問を、実際にAIに回答させて表示（ANSWER_MODEL_ID が必要）
 *   EVIDENCE_THRESHOLD=0.25 …    AIを呼ぶ前のふるい分けの下限を変える（既定は DEFAULT_EVIDENCE_THRESHOLD）
 *   EMBEDDER=local npm run eval  … AWSを呼ばずに試す
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { answerWithEvidence, createAnswerer } from "../src/lib/answer";
import { NO_ANSWER } from "../src/lib/prompt";
import { createEmbedder } from "../src/lib/embed";
import { evaluateQuestion, hitRate, suggestThreshold, type EvalQuestion, type EvalRow } from "../src/lib/evaluate";
import { DEFAULT_EVIDENCE_THRESHOLD, topSections, type StoredChunk } from "../src/lib/search";
import { buildIndex, CHUNK_MODE, INDEX_PATH } from "./build-index";

const K = 3;
/** 実行結果の写し。チャット側から読み取れるよう、毎回ここに上書きで保存する。 */
const RESULT_PATH = path.join(process.cwd(), ".data", "eval-latest.md");
const out: string[] = [];
function log(text: string) {
  console.log(text);
  out.push(text);
}

async function loadIndex(expected: string): Promise<StoredChunk[]> {
  try {
    const saved = JSON.parse(await readFile(INDEX_PATH, "utf8")) as { embedder: string; mode?: string; items: StoredChunk[] };
    if (saved.embedder === expected && (saved.mode ?? "section") === CHUNK_MODE) return saved.items;
    console.log(`保存済みの索引（${saved.embedder}、${saved.mode ?? "section"}）と設定が違うので作り直します`);
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
  const hitsById = new Map<string, ReturnType<typeof topSections>>();
  for (const q of questions) {
    const hits = topSections(items, await embedder.embed(q.question), K);
    hitsById.set(q.id, hits);
    rows.push(evaluateQuestion(q, hits));
  }

  log(`# 評価結果（${new Date().toLocaleString("ja-JP")}）\n\n埋め込み：${embedder.name}（検索の単位：${CHUNK_MODE}）\n`);
  const table = rows.map((r) => ({
    id: r.id,
    種類: r.type === "answerable" ? "答えあり" : "記載なし",
    上位3件に正解: r.hit === null ? "-" : r.hit ? `○（${r.rank}位）` : "×",
    最高類似度: r.topScore.toFixed(3),
    "1位": r.top[0],
  }));
  console.table(table);
  out.push("| id | 種類 | 上位3件に正解 | 最高類似度 | 1位 |", "|---|---|---|---|---|");
  for (const r of table) out.push(`| ${r.id} | ${r.種類} | ${r.上位3件に正解} | ${r.最高類似度} | ${r["1位"]} |`);
  out.push("");
  const t = suggestThreshold(rows);
  log(`上位${K}件の正解率（答えあり${rows.filter((r) => r.type === "answerable").length}問）：${(hitRate(rows) * 100).toFixed(0)}%`);
  log(
    `類似度：答えありの最小 ${t.minAnswerable.toFixed(3)} ／ 記載なしの最大 ${t.maxNoAnswer.toFixed(3)} → しきい値の候補 ${t.threshold ?? "なし（重なっている）"}`,
  );

  const n = Number(process.argv[process.argv.indexOf("--answer") + 1] ?? 0);
  if (process.argv.includes("--answer") && n > 0) {
    const answerer = createAnswerer();
    const threshold = Number(process.env.EVIDENCE_THRESHOLD ?? DEFAULT_EVIDENCE_THRESHOLD);
    log(`\n## 回答の確認（${answerer.name}、ふるい分けの下限 ${threshold}）`);
    const targets = [
      ...questions.filter((x) => x.type === "answerable").slice(0, n),
      ...questions.filter((x) => x.type === "no_answer"),
    ];
    let ok = 0;
    for (const q of targets) {
      const res = await answerWithEvidence(answerer, q.question, hitsById.get(q.id)!, threshold);
      const saidNoAnswer = res.text.includes(NO_ANSWER);
      const pass = q.type === "no_answer" ? saidNoAnswer : !saidNoAnswer;
      if (pass) ok++;
      const how = res.answered ? "AIが判断" : "ふるい分けで除外";
      log(`\n■ ${q.id}（${q.type === "answerable" ? "答えあり" : "記載なし"}／${how}／${pass ? "○" : "×"}）${q.question}\n${res.text}`);
    }
    log(`\n回答の判定：${targets.length}問中${ok}問が期待どおり（記載なしは決まり文句を返せたか、答えありは答えられたか）`);
  }

  await mkdir(path.dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, out.join("\n") + "\n", "utf8");
  console.log(`\n結果を ${path.relative(process.cwd(), RESULT_PATH)} に保存しました`);
}

main().catch(async (e) => {
  console.error(e);
  out.push("", "## エラー", "```", String(e?.stack ?? e), "```");
  await mkdir(path.dirname(RESULT_PATH), { recursive: true }).catch(() => {});
  await writeFile(RESULT_PATH, out.join("\n") + "\n", "utf8").catch(() => {});
  process.exit(1);
});
