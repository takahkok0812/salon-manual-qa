/**
 * このアカウント・リージョンで使える推論プロファイル（モデルID）を一覧する。
 *   npm run models
 * 表示された ID を ANSWER_MODEL_ID に設定する（例: Claude や Nova の推論プロファイル）。
 */
import { BedrockClient, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock";

async function main() {
  const client = new BedrockClient({});
  const ids: string[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(new ListInferenceProfilesCommand({ nextToken, maxResults: 100 }));
    for (const p of res.inferenceProfileSummaries ?? []) {
      if (/claude|nova/i.test(p.inferenceProfileId ?? "")) ids.push(`${p.inferenceProfileId}  （${p.inferenceProfileName}）`);
    }
    nextToken = res.nextToken;
  } while (nextToken);
  console.log(ids.sort().join("\n") || "Claude・Nova の推論プロファイルが見つかりません");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
