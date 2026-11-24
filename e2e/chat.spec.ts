import { expect, test } from "@playwright/test";

test("ログインしないと質問できず、スタッフで入ると質問欄が出る", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "スタッフで入る" })).toBeVisible();
  await expect(page.getByLabel("質問", { exact: true })).toHaveCount(0);

  const res = await page.request.post("/api/ask", { data: { question: "有給は何日前？" } });
  expect(res.status()).toBe(401);

  await page.getByRole("button", { name: "スタッフで入る" }).click();
  await expect(page.getByText("スタッフとしてログイン中")).toBeVisible();
  await expect(page.getByLabel("質問", { exact: true })).toBeVisible();
});

test("質問すると根拠つきで答え、1日の上限を超えると断る", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "店長で入る" }).click();

  await page.getByLabel("質問", { exact: true }).fill("有給休暇は何日前までに申請が必要？");
  await page.getByRole("button", { name: "質問する" }).click();
  const answers = page.getByRole("region", { name: "回答" });
  await expect(answers.getByRole("link", { name: "根拠1" })).toBeVisible();
  await expect(answers.getByRole("heading", { name: "根拠にしたマニュアル" })).toBeVisible();
  await expect(page.getByText("今日あと1回")).toBeVisible();

  await page.getByLabel("質問", { exact: true }).fill("シフトの希望はいつまで？");
  await page.getByRole("button", { name: "質問する" }).click();
  await expect(page.getByText("今日あと0回")).toBeVisible();

  await page.getByLabel("質問", { exact: true }).fill("打刻を忘れたら？");
  await page.getByRole("button", { name: "質問する" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "今日の質問は2回まで" })).toBeVisible();
});

test("ログアウトするとログイン画面に戻る", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "スタッフで入る" }).click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "スタッフで入る" })).toBeVisible();
});

test("店長は「役に立たなかった」回答を、答えられなかった質問の一覧で見られる", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "店長で入る" }).click();
  await expect(page.getByRole("heading", { name: "答えられなかった質問（店長だけ）" })).toBeVisible();

  await page.getByLabel("質問", { exact: true }).fill("ハサミの消毒は何で？");
  await page.getByRole("button", { name: "質問する" }).click();
  await page.getByRole("button", { name: "役に立たなかった" }).click();
  await expect(page.getByText("評価を記録しました（役に立たなかった）")).toBeVisible();
  await expect(page.getByRole("region", { name: "答えられなかった質問" }).getByText("ハサミの消毒は何で？")).toBeVisible();
});

test("スタッフには答えられなかった質問の一覧が出ず、APIも403", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "スタッフで入る" }).click();
  await expect(page.getByText("スタッフとしてログイン中")).toBeVisible();
  await expect(page.getByRole("heading", { name: "答えられなかった質問（店長だけ）" })).toHaveCount(0);
  expect((await page.request.get("/api/unresolved")).status()).toBe(403);
});

test("店長がアップロードした文書は本人の質問にだけ使われ、削除できる。スタッフは文書管理を使えない", async ({ page, browser }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "店長で入る" }).click();
  const panel = page.getByRole("region", { name: "文書の管理" });
  await expect(panel.getByText("サンプル").first()).toBeVisible();

  await panel.getByLabel("文書をアップロード").setInputFiles({
    name: "社員旅行.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 社員旅行の規程\n\n## 1. 時期と行き先\n\n- 社員旅行は毎年5月の第2週に行う。\n- 行き先は全員の投票で決める。\n"),
  });
  await expect(panel.getByRole("row", { name: /社員旅行\.md/ })).toContainText("取り込み完了");

  await page.getByLabel("質問", { exact: true }).fill("社員旅行はいつ行く？");
  await page.getByRole("button", { name: "質問する" }).click();
  await expect(page.getByRole("region", { name: "回答" }).getByText("社員旅行の規程 ／ 1. 時期と行き先")).toBeVisible();

  // 別の人（スタッフ）には使われず、文書管理のAPIも使えない
  const other = await browser.newPage();
  await other.goto("/chat");
  await other.getByRole("button", { name: "スタッフで入る" }).click();
  await other.getByLabel("質問", { exact: true }).fill("社員旅行はいつ行く？");
  await other.getByRole("button", { name: "質問する" }).click();
  await expect(other.getByText("今日あと1回")).toBeVisible();
  await expect(other.getByText("社員旅行の規程")).toHaveCount(0);
  expect((await other.request.get("/api/documents")).status()).toBe(403);
  await other.close();

  await panel.getByRole("button", { name: "社員旅行.mdを削除" }).click();
  await expect(panel.getByRole("row", { name: /社員旅行\.md/ })).toHaveCount(0);
});

test("メモをカウンセリング記録にまとめ、各項目にもとの文の番号が付く", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "スタッフで入る" }).click();
  const memo = page.getByRole("region", { name: "音声メモの要約" });
  await memo.getByRole("button", { name: "例文を入れる" }).click();
  await memo.getByRole("button", { name: "記録にまとめる" }).click();

  const record = memo.getByRole("region", { name: "カウンセリング記録" });
  await expect(record.getByText("ご要望")).toBeVisible();
  await expect(record.getByRole("button", { name: "もとの文1" })).toBeVisible();
  await expect(record.getByRole("listitem").first()).toHaveText("今日は肩につくくらいまで短くしたいです。");
  await expect(page.getByText("今日あと1回")).toBeVisible();

  const res = await page.request.post("/api/summarize", { data: { memo: "" } });
  expect(res.status()).toBe(400);
});
