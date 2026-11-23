import { expect, test } from "@playwright/test";

test("トップにタイトルと、しくみの説明が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "サロンマニュアルQ&A" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "このデモのしくみ" })).toBeVisible();
});

test("質問を選ぶと、根拠の番号つきの回答と、根拠にしたマニュアルが表示される", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "有給は何日前までに申請が必要？" }).click();
  const answer = page.getByRole("region", { name: "回答" });
  await expect(answer.getByText("2週間前").first()).toBeVisible();
  await expect(answer.getByRole("link", { name: "根拠1" })).toBeVisible();
  await expect(answer.getByRole("heading", { name: "根拠にしたマニュアル" })).toBeVisible();
  await expect(answer.getByRole("listitem").first()).toContainText("4. 有給休暇");
});

test("マニュアルにない質問は「記載なし」と表示し、根拠は出さない", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ヘアドネーションの受付はしている？" }).click();
  const answer = page.getByRole("region", { name: "回答" });
  await expect(answer.getByText("マニュアルに記載なし")).toBeVisible();
  await expect(answer.getByRole("heading", { name: "根拠にしたマニュアル" })).toHaveCount(0);
});

test("ほかの質問も見るで、全問が並ぶ", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /ほかの質問も見る/ }).click();
  await expect(page.getByRole("navigation", { name: "質問を選ぶ" }).getByRole("listitem")).toHaveCount(27);
});
