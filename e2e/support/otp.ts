import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import postgres from "postgres";

const OTP_IN_LOG = /HCMUE Portal: (\d{6})/;

// Kích thước log server hiện tại (E2E_SERVER_LOG), để chỉ đọc phần ghi thêm sau đó. Không đọc được thì null.
export function serverLogSize() {
  const path = process.env.E2E_SERVER_LOG;
  try {
    return path ? statSync(path).size : null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mã OTP mới nhất gửi tới `email` trong phần log ghi thêm từ vị trí `from`. `next dev` không có khóa Resend nên mail.lib in cả thư ra log.
async function otpFromLog(email: string, from: number, timeout: number) {
  const path = process.env.E2E_SERVER_LOG!;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const lines = readFileSync(path).subarray(from).toString("utf8").split("\n");
    const otp = lines
      .filter((line) => line.includes(email))
      .map((line) => OTP_IN_LOG.exec(line)?.[1])
      .findLast(Boolean);
    if (otp) return otp;
    await sleep(250);
  }
  return null;
}

// Không đọc được mã từ thư (`next start` dùng khóa Resend giả và log không ghi tiêu đề thư, hoặc thư đi qua hàng đợi chưa gửi): thay mã
// better-auth vừa lưu (băm SHA-256, base64url) bằng một mã test tự chọn, ghi thẳng vào DB như cách seed. Không thêm đường nào lộ OTP vào app.
async function replaceOtpInDatabase(identifier: string, timeout: number) {
  const sql = postgres(process.env.DEFEAT_POSTGRES_PRIMARY_DATABASE_CONNECTION_URL!, { max: 1, onnotice: () => {} });
  const otp = String(100_000 + Math.floor(Math.random() * 900_000));
  const value = `${createHash("sha256").update(otp).digest("base64url")}:0`;
  try {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const rows = await sql`update verification set value = ${value} where identifier = ${identifier} and expires_at > now() returning id`;
      if (rows.length > 0) return otp;
      await sleep(250);
    }
    return null;
  } finally {
    await sql.end();
  }
}

// Mã OTP để kích hoạt/đặt lại mật khẩu của `email` sau khi trang đã yêu cầu gửi mã. Gọi `serverLogSize()` TRƯỚC khi bấm gửi mã và truyền vào.
export async function otpFor(email: string, type: "forget-password" | "email-verification", logStart: number | null) {
  if (logStart !== null) {
    const otp = await otpFromLog(email, logStart, 8000);
    if (otp) return otp;
  }
  return replaceOtpInDatabase(`${type}-otp-${email}`, 10_000);
}

