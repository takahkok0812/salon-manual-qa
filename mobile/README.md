# カウンセリング記録（スマホ版・試作）

Expo（SDK 58）／React Native の見本。Web版の音声メモ機能と同じ要約ロジック（`../src/lib/summarize.ts`）をそのまま使う。

- メモ：キーボードの音声入力（マイク）で話した内容を入れ、「記録にまとめる」で5項目に分ける
- 各項目の「根拠 [n]」を押すと、もとになった文を表示（根拠のない内容は「記載なし」）
- 記録：保存した記録の一覧。押すと中身を開く
- 見本は通信なし（`fakeGenerate`：キーワードで当てる）。本番は `summarizeMemo` に渡す `Generate` を API 呼び出しに差し替える

## 動かし方

```bash
cd mobile
npm install
npx expo start   # 表示されたQRコードを Expo Go で読む
```

## 確認

```bash
npm run typecheck   # mobile の型チェック
npm run lint
cd .. && npx vitest run mobile   # 記録の追加・削除・見出し・根拠の取り出しのテスト
```

親フォルダのファイルを読むため、`metro.config.js` で `../src/lib` を `watchFolders` に足している。
