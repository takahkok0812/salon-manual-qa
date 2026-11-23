/**
 * 公開デモで表示する「事前に作った回答」の形。
 * 公開デモではAIを呼ばず（費用0円）、scripts/build-demo.ts で作った回答を表示する。
 */
export type DemoSource = {
  /** 回答中の [n] と対応する番号（1始まり） */
  n: number;
  docTitle: string;
  heading: string;
  text: string;
};

export type DemoAnswer = {
  id: string;
  /** 評価用の質問セットでの種類。記載なしの例として見せるかどうかに使う */
  kind: "answerable" | "no_answer";
  question: string;
  answer: string;
  /** 記載なしをどこで判断したか。filter＝類似度のふるい分けでAIを呼ばなかった、ai＝根拠を見てAIが判断した */
  decidedBy: "filter" | "ai";
  noAnswer: boolean;
  sources: DemoSource[];
};

export type DemoData = {
  generatedAt: string;
  embedder: string;
  answerModel: string;
  items: DemoAnswer[];
};

/** 自由な質問の最大文字数（画面とAPIで共通）。 */
export const MAX_QUESTION_LENGTH = 200;

/** 自由な質問への回答（APIの返り値）。 */
export type AskResult = {
  question: string;
  answer: string;
  noAnswer: boolean;
  /** filter＝類似度のふるい分けでAIを呼ばなかった、ai＝根拠を見てAIが判断した */
  decidedBy: "filter" | "ai";
  sources: DemoSource[];
};

export type AnswerPart = { kind: "text"; text: string } | { kind: "cite"; n: number };

/** 回答の文字列を、本文と根拠番号（[1] など）に分ける。存在しない番号は本文のまま残す。 */
export function splitCitations(answer: string, sourceCount: number): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  for (const m of answer.matchAll(re)) {
    const n = Number(m[1]);
    if (n < 1 || n > sourceCount) continue;
    if (m.index > last) parts.push({ kind: "text", text: answer.slice(last, m.index) });
    parts.push({ kind: "cite", n });
    last = m.index + m[0].length;
  }
  if (last < answer.length) parts.push({ kind: "text", text: answer.slice(last) });
  return parts;
}

/** 回答で実際に参照された根拠の番号（重複なし、出てきた順）。 */
export function citedNumbers(answer: string, sourceCount: number): number[] {
  const seen: number[] = [];
  for (const p of splitCitations(answer, sourceCount)) {
    if (p.kind === "cite" && !seen.includes(p.n)) seen.push(p.n);
  }
  return seen;
}
