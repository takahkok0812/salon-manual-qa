import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // ローカルで既存のChromiumを使うとき用（CIでは未設定）
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // ログイン後の「自由に質問」は、AWSを呼ばない埋め込みと回答で確かめる
    env: { EMBEDDER: "local", ANSWER_PROVIDER: "fake", ALLOW_DEV_SECRET: "1", DAILY_QUESTION_LIMIT: "2" },
  },
});
