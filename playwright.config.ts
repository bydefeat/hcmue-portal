import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// CẢNH BÁO: e2e XÓA SẠCH rồi seed lại database mà DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL đang trỏ tới (globalSetup chạy
// `npm run db:seed`). Chỉ chạy trên database phát triển/kiểm thử, không bao giờ trên dữ liệu thật. Bỏ bước seed: E2E_SKIP_SEED=1.
//
// Biến môi trường:
// - E2E_SERVER=start (mặc định): `next build` rồi `next start`, đúng như khi triển khai. E2E_SERVER=dev: `next dev` (nhanh khi đang viết test).
// - E2E_SKIP_BUILD=1: với E2E_SERVER=start, dùng bản build sẵn trong .next.
// - E2E_BASE_URL: mặc định DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL trong .env (better-auth chỉ nhận request từ origin này).
// - E2E_SERVER_LOG: tệp log của server. Server do Playwright bật thì ghi vào e2e/.output/server.log; dùng lại server đang chạy
//   (reuseExistingServer) thì trỏ biến này tới log của server đó để test kích hoạt tài khoản đọc được mã OTP in ra log.
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
  // Mỗi file một worker; test trong file chạy tuần tự vì nhiều kịch bản ghi dữ liệu. Các file không ghi đè dữ liệu của nhau.
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
    // Chỉ dùng lại server đang chạy ở chế độ dev; chế độ start luôn tự build và bật để kiểm đúng bản sẽ triển khai.
    reuseExistingServer: mode === "dev",
    timeout: 15 * 60_000,
    env: {
      // Giờ hiển thị được định dạng theo múi giờ của tiến trình: server phải chạy cùng múi giờ với người dùng (Việt Nam), lệch thì
      // React báo hydration mismatch ở mọi chỗ hiện giờ. Trình duyệt test cũng đặt Asia/Ho_Chi_Minh (use.timezoneId).
      TZ: "Asia/Ho_Chi_Minh",
      // Không bao giờ gửi thư thật từ e2e. `next start` (production) bắt buộc có khóa nên dùng khóa giả: Resend từ chối, mail.lib ghi
      // lỗi kèm tiêu đề thư (có mã OTP) ra log. `next dev` bỏ trống khóa: mail.lib in cả thư ra log.
      DEFEAT_RESEND_API_KEY: mode === "start" ? "re_e2e_not_a_real_key" : "",
    },
    stdout: "ignore",
    stderr: "pipe",
  },
});
