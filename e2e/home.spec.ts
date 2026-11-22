import { expect, test } from "@playwright/test";

test("トップにサンプルのマニュアル5本が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "サロンマニュアルQ&A" })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText("クレーム対応マニュアル")).toBeVisible();
});
