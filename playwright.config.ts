import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

const baseURL = process.env.E2E_BASE_URL ?? process.env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
const mode = process.env.E2E_SERVER === "dev" ? "dev" : "start";
const serverLog = process.env.E2E_SERVER_LOG ?? "e2e/.output/server.log";
process.env.E2E_SERVER_LOG = serverLog;

const serve = mode === "dev" ? `npx next dev -p ${port}` : `${process.env.E2E_SKIP_BUILD ? "" : "npx next build && "}npx next start -p ${port}`;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.output/results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: mode === "dev" ? 120_000 : 60_000,
  expect: { timeout: mode === "dev" ? 30_000 : 10_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.output/report", open: "never" }]],
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: mode === "dev" ? 90_000 : 30_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
  ],
  webServer: {
    command: `mkdir -p e2e/.output && (${serve}) 2>&1 | tee ${serverLog}`,
    url: `${baseURL}/authentication/sign-in`,
    reuseExistingServer: mode === "dev",
    timeout: 15 * 60_000,
    env: {
      TZ: "Asia/Ho_Chi_Minh",
      DEFEAT_RESEND_API_KEY: mode === "start" ? "re_e2e_not_a_real_key" : "",
    },
    stdout: "ignore",
    stderr: "pipe",
  },
});
