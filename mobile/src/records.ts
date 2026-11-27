import type { SummaryResult } from "../../src/lib/summarize";
import { NOT_MENTIONED } from "../../src/lib/summarize";

/** 端末の中だけで持つカウンセリング記録（通信しない）。 */
export interface CounselingRecord {
  id: string;
  createdAt: number;
  memo: string;
  result: SummaryResult;
}

export type RecordsAction = { type: "add"; record: CounselingRecord } | { type: "remove"; id: string };

/** 新しい記録を先頭に。同じ id は入れ直さない。 */
export function recordsReducer(state: CounselingRecord[], action: RecordsAction): CounselingRecord[] {
  switch (action.type) {
    case "add":
      if (state.some((r) => r.id === action.record.id)) return state;
      return [action.record, ...state];
    case "remove":
      return state.filter((r) => r.id !== action.id);
  }
}

/** 一覧に出す見出し：ご要望の内容（なければメモの書き出し）を短く。 */
export function recordTitle(record: CounselingRecord, max = 24): string {
  const wish = record.result.fields.find((f) => f.label === "ご要望");
  const base = wish && wish.text !== NOT_MENTIONED ? wish.text : record.memo.replace(/\s+/g, " ");
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

/** 記載のあった項目の数（一覧で「5項目中3」のように出す）。 */
export function filledCount(result: SummaryResult): number {
  return result.fields.filter((f) => f.text !== NOT_MENTIONED).length;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 根拠の番号から、もとの文を取り出す（範囲外は無視）。 */
export function sourceSentences(result: SummaryResult, sources: number[]): string[] {
  return sources.filter((n) => n >= 1 && n <= result.sentences.length).map((n) => `[${n}] ${result.sentences[n - 1]}`);
}

export const SAMPLE_MEMO =
  "今日は肩くらいまで短くしたいです 前回のカラーが少し明るすぎたので落ち着いた色にしたい 毛先の傷みが気になるとのこと 今日はカットとカラーとトリートメント 前にカラーでしみたことがあるので頭皮に注意 次回は2か月後にカラーのリタッチを提案";
