import { expect, test } from "@playwright/test";

test("ログインしないと質問できず、スタッフで入ると質問欄が出る", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "スタッフで入る" })).toBeVisible();
  await expect(page.getByLabel("質問")).toHaveCount(0);

  const res = await page.request.post("/api/ask", { data: { question: "有給は何日前？" } });
  expect(res.status()).toBe(401);

  await page.getByRole("button", { name: "スタッフで入る" }).click();
  await expect(page.getByText("スタッフとしてログイン中")).toBeVisible();
  await expect(page.getByLabel("質問")).toBeVisible();
});

test("質問すると根拠つきで答え、1日の上限を超えると断る", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "店長で入る" }).click();

  await page.getByLabel("質問").fill("有給休暇は何日前までに申請が必要？");
  await page.getByRole("button", { name: "質問する" }).click();
  const answers = page.getByRole("region", { name: "回答" });
  await expect(answers.getByRole("link", { name: "根拠1" })).toBeVisible();
  await expect(answers.getByRole("heading", { name: "根拠にしたマニュアル" })).toBeVisible();
  await expect(page.getByText("今日あと1回")).toBeVisible();

  await page.getByLabel("質問").fill("シフトの希望はいつまで？");
  await page.getByRole("button", { name: "質問する" }).click();
  await expect(page.getByText("今日あと0回")).toBeVisible();

  await page.getByLabel("質問").fill("打刻を忘れたら？");
  await page.getByRole("button", { name: "質問する" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "今日の質問は2回まで" })).toBeVisible();
});

test("ログアウトするとログイン画面に戻る", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "スタッフで入る" }).click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.getByRole("button", { name: "スタッフで入る" })).toBeVisible();
});
