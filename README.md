# salon-manual-qa

美容室の社内マニュアルに、**根拠を示して答える**AIチャットのデモです。マニュアルにないことは推測せず「記載なし」と答えます。

> 開発中（2026年11月〜12月）。サンプルのマニュアルは架空の美容室チェーン「みどり坂ヘア」のもので、実在の店舗・規則とは関係ありません。

## できること（予定）

| 機能 | 状態 |
| --- | --- |
| マニュアル（Markdown・テキスト）の取り込み：分割 → 埋め込み → 保存 | 分割と検索の処理・テストまで。AWS上での取り込みは雛形 |
| 質問への回答：関連箇所を検索し、Claudeが根拠の番号つきで回答 | プロンプトまで |
| 根拠がないときは「記載なし」と答え、未解決として記録 | 判定処理まで |
| 公開デモ用：サンプル質問の回答をあらかじめ生成して保存し、表示する | 未着手 |
| 回答への「役に立った／立たなかった」 | 未着手 |
| 管理画面：文書の一覧・削除、質問ログ、未解決の質問 | 未着手 |
| ログイン：スタッフ／店長の2ロール | 未着手 |

## 構成

- 画面とAPI：Next.js（App Router・TypeScript）、AWS Amplify Hosting で配信
- 回答：Amazon Bedrock の Claude
- 埋め込み：Amazon Bedrock の Titan Text Embeddings V2
- 保存：原本は S3、分割した文書・埋め込み・質問ログは DynamoDB
- 取り込み：S3 へのアップロードで Lambda が起動（`infra/template.yaml`、AWS SAM）

## 設計で決めたこと

- **常時課金のあるサービスを使わない**：ベクトル検索専用のサービスはデモには重いので、数千件まではサーバー側で類似度を計算する。検索部分は `VectorStore` で差し替えられるようにしてある（`src/lib/search.ts`）。
- **分からないときは答えない**：一番近い区切りの類似度がしきい値未満なら回答しない。しきい値は評価用の質問セットで決める。
- **費用をほぼ0円にする**：期限なしの無料枠があるLambda・DynamoDB・S3を中心に組み、置いておくだけで課金されるサービス（NATゲートウェイ、検索専用サービス、RDSなど）は使わない。
- **公開デモはAIを呼ばない**：公開デモでは、サンプル質問への回答をあらかじめ生成して保存したものを表示する。本物のAIが答える「自由に質問」はログインした人だけ、1日数回まで。
- **予算アラート**：AWSの予算アラート（約1,000円）をテンプレートに含める。

## 回答の評価

`samples/eval/questions.json` に20件の質問があります（答えがある17件、マニュアルにない3件）。
正解の文書と見出しが検索の上位3件に入る割合と、記載がない質問で「記載なし」と答えられた割合を測ります。

## 開発

```bash
npm ci
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test           # Vitest
npm run e2e        # Playwright（ビルドして起動してから実行）
```

AWSへのデプロイ（取り込み部分）：

```bash
sam build
sam deploy --parameter-overrides AlertEmail=you@example.com
```

リージョンはシドニー（ap-southeast-2）です。AWSの無料プランでは、プロジェクトのリージョンがシドニーに固定されるためです（`samconfig.toml`）。Bedrockの Titan Text Embeddings V2 と Claude はシドニーで使えます。

## ディレクトリ

```text
src/app/             画面（Next.js）
src/lib/chunk.ts     Markdownを見出しごとに分割
src/lib/search.ts    類似度計算・検索の差し替え口・根拠の有無の判定
src/lib/prompt.ts    Claudeに渡すプロンプト
functions/ingest/    取り込み用Lambda
infra/template.yaml  AWS SAMのテンプレート
samples/manuals/     サンプルのマニュアル（架空）
samples/eval/        評価用の質問セット
e2e/                 Playwrightのテスト
```
