import assert from "node:assert/strict";
import { after, describe, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/modules/authentication/authentication.lib";
import { account, rateLimit, user } from "@/modules/authentication/authentication.schema";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { safeNextPath } from "@/modules/authentication/authentication.constant";
import { landingAfterSignIn, parseRoles } from "@/shared/constants/role.constant";
import { formatStudentCode, isStudentCode, normalizeStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";

const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";
const STUDENT_CODE = "5001104009";
const BASE_URL = env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL;

// Mỗi request một IP riêng để rate limit đăng nhập (5 lần/phút) không làm test chạy sau bị 429.
let requestCount = 0;

async function call(path: string, body: unknown) {
  requestCount += 1;
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": `10.0.0.${requestCount}` },
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json().catch(() => null)) as { code?: string; user?: { role?: string; username?: string } } | null;
  return { status: response.status, json, cookie: response.headers.get("set-cookie") ?? "" };
}

after(async () => {
  await db.delete(rateLimit);
  await db.$client.end();
});

describe("student-code.lib", () => {
  test("chuẩn hoá, kiểm tra và hiển thị MSSV theo thẻ sinh viên", () => {
    assert.equal(normalizeStudentCode(" 50.01.104.013 "), "5001104013");
    assert.equal(formatStudentCode("5001104013"), "50.01.104.013");
    assert.equal(formatStudentCode("50.01.104.013"), "50.01.104.013");
    assert.equal(formatStudentCode("GV0104012"), "GV0104012");
    assert.ok(isStudentCode("50.01.104.013"));
    assert.ok(!isStudentCode("500110401"));
    assert.ok(!isStudentCode("hanhpt@hcmue.edu.vn"));
    assert.equal(studentEmailOf("50.01.104.013"), "5001104013@student.hcmue.edu.vn");
  });
});

describe("trang đích sau đăng nhập", () => {
  test("chỉ quay lại ?next= nội bộ và thuộc cổng tài khoản được vào", () => {
    assert.deepEqual(parseRoles("lecturer, admin,unknown"), ["lecturer", "admin"]);
    assert.equal(safeNextPath("//evil.example"), null);
    assert.equal(safeNextPath("https://evil.example"), null);
    assert.equal(safeNextPath("/application/grades"), "/application/grades");
    assert.equal(landingAfterSignIn(["student"], "/application/grades"), "/application/grades");
    assert.equal(landingAfterSignIn(["admin"], "/application/dashboard"), "/administrator");
    assert.equal(landingAfterSignIn(["lecturer", "admin"], "/administrator/terms"), "/administrator/terms");
    assert.equal(landingAfterSignIn(["student"], "/announcements"), "/announcements");
    assert.equal(landingAfterSignIn(["student"], null), "/application/dashboard");
  });
});

describe("đăng nhập", () => {
  test("sinh viên đăng nhập bằng MSSV có dấu chấm hoặc 10 chữ số liền", async () => {
    for (const username of [formatStudentCode(STUDENT_CODE), STUDENT_CODE]) {
      const result = await call("/sign-in/username", { username, password: PASSWORD });
      assert.equal(result.status, 200, username);
      assert.equal(result.json?.user?.role, "student");
      assert.match(result.cookie, /hcmue\.session_token=/);
    }
  });

  test("sinh viên không đăng nhập được bằng email", async () => {
    const result = await call("/sign-in/email", { email: studentEmailOf(STUDENT_CODE), password: PASSWORD });
    assert.equal(result.status, 401);
    assert.equal(result.json?.code, "STUDENT_USE_CODE");
  });

  test("giảng viên, cán bộ tạm đăng nhập bằng email", async () => {
    const result = await call("/sign-in/email", { email: "khoatm@hcmue.edu.vn", password: PASSWORD });
    assert.equal(result.status, 200);
    assert.equal(result.json?.user?.role, "admin");
  });

  test("sai mật khẩu và MSSV không tồn tại trả cùng một lỗi", async () => {
    const wrongPassword = await call("/sign-in/username", { username: STUDENT_CODE, password: "sai-mat-khau" });
    const unknownCode = await call("/sign-in/username", { username: "4901104999", password: PASSWORD });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownCode.status, 401);
    assert.equal(wrongPassword.json?.code, "INVALID_USERNAME_OR_PASSWORD");
    assert.equal(unknownCode.json?.code, wrongPassword.json?.code);
  });

  test("MSSV sai định dạng bị từ chối", async () => {
    const result = await call("/sign-in/username", { username: "hanhpt", password: PASSWORD });
    assert.equal(result.status, 422);
    assert.equal(result.json?.code, "INVALID_USERNAME");
  });

  test("không có đăng ký và không đăng nhập bằng OTP", async () => {
    const signUp = await call("/sign-up/email", { email: "moi@hcmue.edu.vn", password: PASSWORD, name: "Người mới" });
    assert.notEqual(signUp.status, 200);
    const otpSignIn = await call("/sign-in/email-otp", { email: "khoatm@hcmue.edu.vn", otp: "000000" });
    assert.equal(otpSignIn.status, 404);
    const [created] = await db.select().from(user).where(eq(user.email, "moi@hcmue.edu.vn"));
    assert.equal(created, undefined);
  });

  test("đăng nhập sai liên tục từ một IP bị chặn", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth/sign-in/username`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": "10.9.9.9" },
          body: JSON.stringify({ username: STUDENT_CODE, password: "sai-mat-khau" }),
        }),
      );
      statuses.push(response.status);
    }
    assert.ok(statuses.includes(429), statuses.join(","));
  });
});

describe("khôi phục mật khẩu", () => {
  test("gửi mã tới email trường, kiểm mã rồi đặt mật khẩu mới", async () => {
    const email = studentEmailOf(STUDENT_CODE);
    const warn = mock.method(console, "warn", () => {});
    try {
      assert.equal((await call("/email-otp/request-password-reset", { email })).status, 200);
      const otp = String(warn.mock.calls.at(-1)?.arguments[0]).match(/: (\d{6})"/)?.[1];
      assert.ok(otp, "OTP được in ra log");

      const wrong = await call("/email-otp/check-verification-otp", { email, otp: otp === "000000" ? "111111" : "000000", type: "forget-password" });
      assert.equal(wrong.json?.code, "INVALID_OTP");
      assert.equal((await call("/email-otp/check-verification-otp", { email, otp, type: "forget-password" })).status, 200);
      assert.equal((await call("/email-otp/reset-password", { email, otp, password: "MatKhauMoi@2026" })).status, 200);

      assert.equal((await call("/sign-in/username", { username: STUDENT_CODE, password: PASSWORD })).status, 401);
      assert.equal((await call("/sign-in/username", { username: STUDENT_CODE, password: "MatKhauMoi@2026" })).status, 200);
    } finally {
      warn.mock.restore();
      const [student] = await db.select().from(user).where(eq(user.email, email));
      await db.update(account).set({ password: await hashPassword(PASSWORD) }).where(eq(account.userId, student.id));
    }
  });

  test("email chưa được cấp tài khoản vẫn trả thành công nhưng không gửi mã", async () => {
    const warn = mock.method(console, "warn", () => {});
    try {
      const result = await call("/email-otp/request-password-reset", { email: "4901104999@student.hcmue.edu.vn" });
      assert.equal(result.status, 200);
      assert.equal(warn.mock.callCount(), 0);
    } finally {
      warn.mock.restore();
    }
  });
});
