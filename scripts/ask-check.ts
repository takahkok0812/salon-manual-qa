/**
 * 「自由に質問」と同じ処理を、AWS上のデータで確かめる（画面を使わずに）。
 * DynamoDB に取り込んだ区切りを読み、Titan で検索し、ANSWER_MODEL_ID のモデルで答える。
 *   npm run ask:check
 */
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { createAnswerer } from "../src/lib/answer";
import { ask } from "../src/lib/ask";
import { createEmbedder } from "../src/lib/embed";
import { getIndexItems } from "../src/lib/index-store";

const QUESTIONS = ["お店で売っているトリートメントを返品したいと言われた", "スタッフの駐輪場はある？"];

async function main() {
  const res = await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: process.env.STACK_NAME ?? "salon-manual-qa" }));
  const table = res.Stacks?.[0]?.Outputs?.find((o) => o.OutputKey === "ChunksTableName")?.OutputValue;
  if (!table) throw new Error("ChunksTableName が見つかりません（sam deploy 済みか確認）");
  process.env.CHUNKS_TABLE = table;

  const embedder = createEmbedder();
  const items = await getIndexItems(embedder);
  console.log(`DynamoDB から ${items.length}件を読み込み（${table}）`);
  const answerer = createAnswerer();
  for (const q of QUESTIONS) {
    const r = await ask(q, { items, embedder, answerer });
    console.log(`\n■ ${q}\n判断：${r.decidedBy === "ai" ? "AI" : "ふるい分け"}／${r.noAnswer ? "記載なし" : "回答"}\n${r.answer}`);
    for (const s of r.sources) console.log(`  [${s.n}] ${s.docTitle} ／ ${s.heading}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
