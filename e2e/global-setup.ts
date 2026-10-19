import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error(`Lệnh ${command} ${args.join(" ")} lỗi (mã ${result.status})`);
}

// CẢNH BÁO: xóa sạch và seed lại database DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL (biến môi trường hiện tại, không có thì .env).
// Mỗi lần chạy e2e bắt đầu từ cùng một dữ liệu nên các kịch bản ghi dữ liệu không ảnh hưởng lần chạy sau.
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  const database = process.env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL?.replace(/\/\/[^@]*@/, "//");
  console.warn(`e2e: xóa và seed lại database ${database ?? "(chưa đặt)"}`);
  run("npm", ["run", "db:seed", "--silent"]);
  const envFile = existsSync(".env") ? ["--env-file=.env"] : [];
  run("npx", ["tsx", "--conditions=react-server", ...envFile, "e2e/support/provision.ts"]);
}
