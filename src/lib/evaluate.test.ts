import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerWithEvidence, type Answerer } from "./answer";
import { toEmbeddingInput } from "./chunk";
import { BigramEmbedder } from "./embed";
import { evaluateQuestion, hitRate, suggestThreshold, type EvalQuestion, type EvalRow } from "./evaluate";
import { NO_ANSWER } from "./prompt";
import { loadSampleChunks } from "./samples";
import { topK, type Hit, type StoredChunk } from "./search";

const row = (type: EvalRow["type"], topScore: number, hit: boolean | null = null): EvalRow => ({
  id: "x",
  type,
  hit,
  rank: hit ? 1 : null,
  topScore,
  top: [],
});

describe("suggestThreshold", () => {
  it("答えありの最小と記載なしの最大のあいだを返す", () => {
    const t = suggestThreshold([row("answerable", 0.6, true), row("answerable", 0.8, true), row("no_answer", 0.4)]);
    expect(t.threshold).toBe(0.5);
  });

  it("重なっていれば null", () => {
    expect(suggestThreshold([row("answerable", 0.4, true), row("no_answer", 0.5)]).threshold).toBeNull();
  });
});

describe("answerWithEvidence", () => {
  const fake: Answerer = { name: "fake", answer: async () => "回答 [1]", generate: async () => "" };
  const hit = (score: number): Hit => ({
    chunk: { docId: "a.md", docTitle: "A", heading: "h", text: "t", chunkId: "a" },
    score,
  });

  it("根拠がなければAIを呼ばずに決まり文句を返す", async () => {
    expect(await answerWithEvidence(fake, "q", [hit(0.2)], 0.5)).toEqual({ text: NO_ANSWER, answered: false });
    expect(await answerWithEvidence(fake, "q", [hit(0.7)], 0.5)).toEqual({ text: "回答 [1]", answered: true });
  });
});

describe("評価の流れ（AWSを呼ばない埋め込みで）", () => {
  it("全問を評価でき、文字の重なりだけでも半分以上は上位3件に入る", async () => {
    const embedder = new BigramEmbedder();
    const chunks = await loadSampleChunks();
    const items: StoredChunk[] = [];
    for (const c of chunks) items.push({ ...c, vector: await embedder.embed(toEmbeddingInput(c)) });

    const raw = await readFile(path.join(process.cwd(), "samples", "eval", "questions.json"), "utf8");
    const { questions } = JSON.parse(raw) as { questions: EvalQuestion[] };
    const rows: EvalRow[] = [];
    for (const q of questions) rows.push(evaluateQuestion(q, topK(items, await embedder.embed(q.question), 3)));

    expect(rows).toHaveLength(questions.length);
    expect(hitRate(rows)).toBeGreaterThanOrEqual(0.5);
  });
});
