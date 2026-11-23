import { answerWithEvidence, type Answerer } from "./answer";
import { MAX_QUESTION_LENGTH, type AskResult } from "./demo";
import type { Embedder } from "./embed";
import { NO_ANSWER } from "./prompt";
import { DEFAULT_EVIDENCE_THRESHOLD, hybridSearch, type StoredChunk } from "./search";

export { MAX_QUESTION_LENGTH, type AskResult };
const K = 3;

/** 質問の文字列を整える。空・長すぎるときは理由を返す。 */
export function normalizeQuestion(raw: unknown): { ok: true; question: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "質問を入力してください" };
  const q = raw.replace(/\s+/g, " ").trim();
  if (!q) return { ok: false, error: "質問を入力してください" };
  if (q.length > MAX_QUESTION_LENGTH) return { ok: false, error: `質問は${MAX_QUESTION_LENGTH}文字以内にしてください` };
  return { ok: true, question: q };
}

/** 検索→（根拠があれば）回答。公開デモの事前回答と同じ形で返す。 */
export async function ask(
  question: string,
  deps: { items: StoredChunk[]; embedder: Embedder; answerer: Answerer; threshold?: number },
): Promise<AskResult> {
  const hits = hybridSearch(deps.items, await deps.embedder.embed(question), question, K);
  const res = await answerWithEvidence(deps.answerer, question, hits, deps.threshold ?? DEFAULT_EVIDENCE_THRESHOLD);
  const noAnswer = res.text.includes(NO_ANSWER);
  return {
    question,
    answer: res.text.trim(),
    noAnswer,
    decidedBy: res.answered ? "ai" : "filter",
    sources: noAnswer ? [] : hits.map((h, i) => ({ n: i + 1, docTitle: h.chunk.docTitle, heading: h.chunk.heading, text: h.chunk.text })),
  };
}
