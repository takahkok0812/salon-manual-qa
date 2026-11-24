/**
 * 音声メモ（カウンセリング中の会話の書き起こし）を、決まった項目のカウンセリング記録にまとめる。
 * 各項目には、もとになった文の番号を必ず付ける（RAG の「根拠の番号」と同じ考え方）。
 * 話に出てこなかった項目は推測せず「記載なし」にする。
 */

export const MAX_MEMO_LENGTH = 1500;
const MAX_SENTENCES = 60;

export const SUMMARY_LABELS = ["ご要望", "髪・頭皮の状態", "施術の内容", "次回の提案", "注意すること"] as const;
export type SummaryLabel = (typeof SUMMARY_LABELS)[number];

export const NOT_MENTIONED = "記載なし";

export interface SummaryField {
  label: SummaryLabel;
  text: string;
  /** もとになった文の番号（1始まり）。記載なしなら空。 */
  sources: number[];
}

export interface SummaryResult {
  sentences: string[];
  fields: SummaryField[];
}

/** 書き起こしを文に分ける。句点・感嘆符・疑問符・改行で区切る。 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?])|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SENTENCES);
}

/** 文字列を整える。空・長すぎるときは理由を返す。 */
export function normalizeMemo(raw: unknown): { ok: true; memo: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "メモを入力してください" };
  const memo = raw.trim();
  if (memo.length > MAX_MEMO_LENGTH) return { ok: false, error: `メモは${MAX_MEMO_LENGTH}文字以内にしてください` };
  return { ok: true, memo };
}

export const SUMMARY_SYSTEM_PROMPT = `あなたは美容室のスタッフを手伝うアシスタントです。
カウンセリング中の会話を書き起こした「メモ」を読み、カウンセリング記録にまとめます。

ルール：
- 項目は次の5つで、この順に出す：${SUMMARY_LABELS.join("、")}
- メモに書かれていることだけを使う。書かれていないことを推測で足さない
- 話に出てこなかった項目は、text を「${NOT_MENTIONED}」、sources を空の配列にする
- 各項目には、根拠にしたメモの文の番号を sources に必ず入れる
- text は1〜2文、です・ます調で簡潔に
- 出力は次の形の JSON だけ。前置きや説明は書かない
{"fields":[{"label":"ご要望","text":"…","sources":[1,2]}]}`;

export function buildSummaryPrompt(sentences: string[]): string {
  return `メモ（文ごとに番号つき）：\n${sentences.map((s, i) => `[${i + 1}] ${s}`).join("\n")}`;
}

/** モデルの出力（JSON）を読み、項目・番号の範囲を確かめて整える。 */
export function parseSummary(raw: string, sentenceCount: number): SummaryField[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("要約の形式を読み取れませんでした");
  const json = JSON.parse(raw.slice(start, end + 1)) as { fields?: unknown };
  const list = Array.isArray(json.fields) ? json.fields : [];
  return SUMMARY_LABELS.map((label) => {
    const found = list.find((f): f is { label: string; text?: unknown; sources?: unknown } => typeof f === "object" && f !== null && (f as { label?: unknown }).label === label);
    const text = typeof found?.text === "string" && found.text.trim() ? found.text.trim() : NOT_MENTIONED;
    const sources = Array.isArray(found?.sources)
      ? [...new Set(found.sources.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= sentenceCount))].sort((a, b) => a - b)
      : [];
    // 根拠の番号がない内容は表示しない（推測で足された可能性があるため）
    if (text === NOT_MENTIONED || sources.length === 0) return { label, text: NOT_MENTIONED, sources: [] };
    return { label, text, sources };
  });
}

export type Generate = (system: string, user: string) => Promise<string>;

export async function summarizeMemo(memo: string, generate: Generate): Promise<SummaryResult> {
  const sentences = splitSentences(memo);
  if (sentences.length === 0) return { sentences, fields: SUMMARY_LABELS.map((label) => ({ label, text: NOT_MENTIONED, sources: [] })) };
  const raw = await generate(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(sentences));
  return { sentences, fields: parseSummary(raw, sentences.length) };
}

const FAKE_KEYWORDS: Record<SummaryLabel, RegExp> = {
  ご要望: /したい|ほしい|希望|なりたい/,
  "髪・頭皮の状態": /傷み|乾燥|頭皮|くせ|白髪|ダメージ/,
  施術の内容: /カット|カラー|パーマ|トリートメント|縮毛/,
  次回の提案: /次回|次は|来月|週間後/,
  注意すること: /アレルギー|しみ|かぶれ|注意|苦手/,
};

/** テスト・手元確認用。AIを呼ばず、キーワードを含む最初の文を各項目に当てる。 */
export const fakeGenerate: Generate = async (_system, user) => {
  const sentences = user
    .split("\n")
    .map((l) => /^\[(\d+)\] (.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ n: Number(m[1]), text: m[2] }));
  const fields = SUMMARY_LABELS.map((label) => {
    const hit = sentences.find((s) => FAKE_KEYWORDS[label].test(s.text));
    return hit ? { label, text: hit.text, sources: [hit.n] } : { label, text: NOT_MENTIONED, sources: [] };
  });
  return JSON.stringify({ fields });
};
