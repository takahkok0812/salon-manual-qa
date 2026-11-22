import type { Hit } from "./search";

export type EvalQuestion = {
  id: string;
  type: "answerable" | "no_answer";
  question: string;
  expected: { doc: string; heading: string }[];
  answer_points: string[];
};

export type EvalRow = {
  id: string;
  type: EvalQuestion["type"];
  /** 上位k件に正解の見出しが入ったか（no_answer は対象外） */
  hit: boolean | null;
  /** 正解が入った順位（1始まり）。入らなければ null */
  rank: number | null;
  topScore: number;
  top: string[];
};

export function evaluateQuestion(q: EvalQuestion, hits: Hit[]): EvalRow {
  const top = hits.map((h) => `${h.chunk.docId} / ${h.chunk.heading}`);
  const idx = hits.findIndex((h) => q.expected.some((e) => e.doc === h.chunk.docId && e.heading === h.chunk.heading));
  return {
    id: q.id,
    type: q.type,
    hit: q.type === "answerable" ? idx >= 0 : null,
    rank: idx >= 0 ? idx + 1 : null,
    topScore: hits[0]?.score ?? 0,
    top,
  };
}

/**
 * しきい値の候補を出す：答えがある質問の一番近い類似度の最小値と、
 * 記載がない質問の一番近い類似度の最大値のあいだ。重なっていれば null。
 */
export function suggestThreshold(rows: EvalRow[]): { threshold: number | null; minAnswerable: number; maxNoAnswer: number } {
  const ans = rows.filter((r) => r.type === "answerable").map((r) => r.topScore);
  const none = rows.filter((r) => r.type === "no_answer").map((r) => r.topScore);
  const minAnswerable = Math.min(...ans);
  const maxNoAnswer = none.length ? Math.max(...none) : 0;
  const threshold = minAnswerable > maxNoAnswer ? Number(((minAnswerable + maxNoAnswer) / 2).toFixed(3)) : null;
  return { threshold, minAnswerable, maxNoAnswer };
}

export function hitRate(rows: EvalRow[]): number {
  const ans = rows.filter((r) => r.type === "answerable");
  return ans.length ? ans.filter((r) => r.hit).length / ans.length : 0;
}
