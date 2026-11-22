import type { Hit } from "./search";

export const NO_ANSWER = "マニュアルに記載がありません。店長か本部に確認してください。";

/** Claudeに渡すシステムプロンプト。根拠の番号を必ず付け、根拠にないことは答えない。 */
export const SYSTEM_PROMPT = [
  "あなたは美容室チェーンの社内マニュアルに答えるアシスタントです。",
  "必ず <sources> の中の情報だけを使って、日本語で短く答えてください。",
  "答えの根拠にした資料の番号を、文の終わりに [1] のように付けてください。",
  `資料に答えがない場合は、推測せずに「${NO_ANSWER}」とだけ答えてください。`,
].join("\n");

export function buildUserPrompt(question: string, hits: Hit[]): string {
  const sources = hits
    .map((h, i) => `<source id="${i + 1}" doc="${h.chunk.docTitle}" heading="${h.chunk.heading}">\n${h.chunk.text}\n</source>`)
    .join("\n");
  return `<sources>\n${sources}\n</sources>\n\n質問：${question}`;
}
