import type { Hit } from "./search";

export const NO_ANSWER = "マニュアルに記載がありません。店長か本部に確認してください。";

/** 回答モデルに渡すシステムプロンプト。根拠の番号を必ず付け、根拠にないことは答えない。 */
export const SYSTEM_PROMPT = [
  "あなたは美容室チェーンの社内マニュアルに答えるアシスタントです。",
  "必ず <sources> の中の情報だけを使って、日本語の「です・ます」調で短く答えてください。",
  "「マニュアルに記載があります」のような前置きや、質問の言い換えは書かず、答えから書き始めてください。",
  "答えの根拠にした資料の番号を、文の終わりに [1] のように付けてください。",
  "資料に書かれていない手順や心構え（「丁寧に説明する」など）を付け足さないでください。",
  `資料に答えがない場合は、推測せずに「${NO_ANSWER}」とだけ答えてください。`,
].join("\n");

export function buildUserPrompt(question: string, hits: Hit[]): string {
  const sources = hits
    .map((h, i) => `<source id="${i + 1}" doc="${h.chunk.docTitle}" heading="${h.chunk.heading}">\n${h.chunk.text}\n</source>`)
    .join("\n");
  return `<sources>\n${sources}\n</sources>\n\n質問：${question}`;
}
