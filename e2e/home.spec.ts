import { expect, test } from "@playwright/test";

test("トップにタイトルと、しくみの説明が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "サロンマニュアルQ&A" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "このデモのしくみ" })).toBeVisible();
});
