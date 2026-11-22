# salon-manual-qa

美容室の社内マニュアルに、**根拠を示して答える**AIチャットのデモです。マニュアルにないことは推測せず「記載なし」と答えます。

> 開発中（2026年11月〜12月）。サンプルのマニュアルは架空の美容室チェーン「みどり坂ヘア」のもので、実在の店舗・規則とは関係ありません。

## できること（予定）

| 機能 | 状態 |
| --- | --- |
| マニュアル（Markdown・テキスト）の取り込み：分割 → 埋め込み → 保存 | 分割と検索の処理・テストまで。AWS上での取り込みは雛形 |
| 質問への回答：関連箇所を検索し、Claudeが根拠の番号つきで回答 | 回答処理と評価スクリプトまで（画面は未着手） |
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

## 検索の精度を測る（手元で）

```powershell
aws login --region ap-southeast-2   # 初回・期限切れのとき
npm run index                       # サンプル5本を分割し、Bedrock の Titan で埋め込み → .data/index.json
npm run eval                        # 評価用の質問20件で、正解の見出しが上位3件に入る割合を表示
npm run models                      # 回答に使えるモデル（推論プロファイル）のIDを一覧
$env:ANSWER_MODEL_ID="<上で出たID>"; npm run eval -- --answer 3   # 答えありの先頭3問＋記載なし3問を実際に回答させる
```

AWSを呼ばずに流れだけ試すときは `$env:EMBEDDER="local"` を付けます（文字の並びだけで比べる簡易版）。
| 埋め込み | 上位3件の正解率 | 答えありの最小類似度 | 記載なしの最大類似度 |
|---|---|---|---|
| 簡易版（文字の並び） | 82%（17問中14問） | 0.165 | 0.279 |
| Titan Text Embeddings V2 | 94%（17問中16問） | 0.273 | 0.341 |

Titan で検索の精度は上がりましたが、答えありと記載なしの類似度は重なっていて、類似度のしきい値だけでは「記載なし」を判定できません。
そのため「記載なし」は2段階で判断します。

1. 類似度が低い質問（既定 0.2 未満）は、AIを呼ばずに「記載なし」と返す（明らかに無関係な質問のふるい分け。費用を抑える）
2. それ以外は上位3件を根拠としてAIに渡し、根拠に答えがなければ「記載なし」と答えさせる

外した1問（q10「買ったシャンプーを返品したい」）は、答えが「6. 会計」の中の1行にあり、支払い方法などの話に埋もれていました。見出しの中をさらに細かく分ける改善候補として残しています。

回答に使うモデルは `ANSWER_PROVIDER`（`bedrock` または `anthropic`）と `ANSWER_MODEL_ID` で切り替えます。`anthropic` のときは `ANTHROPIC_API_KEY` も設定します。

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
src/lib/embed.ts     埋め込み（Bedrock Titan／AWSを呼ばない簡易版）
src/lib/answer.ts    回答（Bedrock Converse／Claude API）と、根拠がないときはAIを呼ばない処理
src/lib/evaluate.ts  検索の評価（上位k件の正解率・しきい値の候補）
scripts/             索引づくり・評価・モデル一覧のスクリプト
functions/ingest/    取り込み用Lambda
infra/template.yaml  AWS SAMのテンプレート
samples/manuals/     サンプルのマニュアル（架空）
samples/eval/        評価用の質問セット
e2e/                 Playwrightのテスト
```
