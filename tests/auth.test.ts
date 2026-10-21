import assert from "node:assert/strict";
import { after, describe, mock, test } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/modules/authentication/authentication.lib";
import { account, rateLimit, signInFailures, user } from "@/modules/authentication/authentication.schema";
import { db } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { AUTH_ERROR_MESSAGE, SIGN_IN_LOCKOUT, authErrorMessage, safeNextPath } from "@/modules/authentication/authentication.constant";
import { landingAfterSignIn, parseRoles } from "@/shared/constants/role.constant";
import { formatLoginName, isLoginName, isStaffCode, normalizeLoginName, staffAccountIdentity } from "@/shared/libs/login-name.lib";
import { formatStudentCode, isStudentCode, normalizeStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";

const PASSWORD = process.env.DEFEAT_SEED_ACCOUNT_PASSWORD || "Hcmue@2026";
const STUDENT_CODE = "5001104009";
const LECTURER_CODE = "GV104011";
const STAFF_CODE = "CB0021";
const LOCKOUT_GHOST = "TT9990001";
const LOCKOUT_RACE = "TT9990002";
const BASE_URL = env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL;

let requestCount = 0;

function nextIp(prefix: number) {
  requestCount += 1;
  return `10.${prefix}.${(requestCount >> 8) & 255}.${requestCount & 255}`;
}

async function call(path: string, body: unknown) {
  const response = await auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": nextIp(0) },
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json().catch(() => null)) as { code?: string; message?: string; user?: { role?: string; username?: string } } | null;
  return { status: response.status, json, cookie: response.headers.get("set-cookie") ?? "" };
}

const failureRowOf = async (username: string) => (await db.select().from(signInFailures).where(eq(signInFailures.username, username)))[0];

after(async () => {
  await db.delete(rateLimit);
  await db.delete(signInFailures).where(inArray(signInFailures.username, [STUDENT_CODE, "4901104999", "gv104011", "cb0021", "tt9990001", "tt9990002"]));
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

  test("tên đăng nhập nhận MSSV và mã cán bộ, giảng viên, không phân biệt hoa thường", () => {
    for (const name of ["50.01.104.013", "5001104013", "GV104011", "gv104011", " Gv 104011 ", "CB0021"]) assert.ok(isLoginName(name), name);
    for (const name of ["hanhpt", "hanhpt@hcmue.edu.vn", "GV-104011", "G104011", "GV12", "500110401"]) assert.ok(!isLoginName(name), name);
    assert.equal(normalizeLoginName(" Gv104011 "), "gv104011");
    assert.equal(normalizeLoginName("50.01.104.013"), "5001104013");
    assert.equal(formatLoginName("gv104011"), "GV104011");
    assert.equal(formatLoginName("5001104013"), "50.01.104.013");
    assert.ok(isStaffCode("cb0021") && !isStaffCode("5001104013"));
    assert.deepEqual(staffAccountIdentity("CB0021"), { username: "cb0021", displayUsername: "CB0021" });
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

  test("chặn các dạng open redirect qua ?next=", () => {
    for (const attack of ["/\t/evil.com", "/\n/evil.com", "/\\evil.com", "/\\/evil.com", "//evil.com", "/.//evil.com", "/%2F/evil.com/..//x", "https:evil.com", "javascript:alert(1)", " /x"]) {
      const safe = safeNextPath(attack);
      assert.ok(safe === null || (safe.startsWith("/") && !safe.startsWith("//")), `${JSON.stringify(attack)} → ${safe}`);
      const landing = landingAfterSignIn(["student"], attack);
      assert.ok(landing.startsWith("/") && !landing.startsWith("//") && new URL(landing, "http://portal.invalid").origin === "http://portal.invalid", `${JSON.stringify(attack)} → ${landing}`);
    }
    assert.equal(safeNextPath("/\t/evil.com"), null);
    assert.equal(safeNextPath("/.//evil.com"), null);
    assert.equal(safeNextPath("/authentication/sign-in"), null);
    assert.equal(safeNextPath("/application/grades?term=1#top"), "/application/grades?term=1#top");
    assert.equal(landingAfterSignIn(["student"], "//evil.com"), "/application/dashboard");
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

  test("giảng viên đăng nhập bằng mã giảng viên, chữ hoa hay chữ thường đều được", async () => {
    for (const username of [LECTURER_CODE, LECTURER_CODE.toLowerCase(), ` ${LECTURER_CODE} `]) {
      const result = await call("/sign-in/username", { username, password: PASSWORD });
      assert.equal(result.status, 200, username);
      assert.equal(result.json?.user?.role, "lecturer");
      assert.equal(result.json?.user?.username, "gv104011");
    }
  });

  test("cán bộ đăng nhập bằng mã cán bộ", async () => {
    for (const username of [STAFF_CODE, STAFF_CODE.toLowerCase()]) {
      const result = await call("/sign-in/username", { username, password: PASSWORD });
      assert.equal(result.status, 200, username);
      assert.equal(result.json?.user?.role, "admin");
    }
  });

  test("không tài khoản nào đăng nhập được bằng email, kể cả đúng mật khẩu; email không tồn tại báo cùng một câu", async () => {
    const emails = [studentEmailOf(STUDENT_CODE), "hanhpt@hcmue.edu.vn", "khoatm@hcmue.edu.vn", "khongco@hcmue.edu.vn"];
    for (const email of emails) {
      const viaEmail = await call("/sign-in/email", { email, password: PASSWORD });
      assert.equal(viaEmail.status, 401, email);
      assert.equal(viaEmail.json?.code, "USE_LOGIN_CODE");
      assert.equal(viaEmail.json?.message, "Đăng nhập bằng mã số sinh viên hoặc mã số cán bộ, giảng viên");
      const viaUsername = await call("/sign-in/username", { username: email, password: PASSWORD });
      assert.equal(viaUsername.status, 401, email);
      assert.equal(viaUsername.json?.code, "USE_LOGIN_CODE");
    }
    assert.equal(AUTH_ERROR_MESSAGE.USE_LOGIN_CODE, "Đăng nhập bằng mã số sinh viên hoặc mã số cán bộ, giảng viên");
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

  test("endpoint app không dùng trả 404: tự đổi tên, tự đặt username, dò MSSV", async () => {
    const signIn = await call("/sign-in/username", { username: STAFF_CODE, password: PASSWORD });
    assert.equal(signIn.status, 200);
    const cookie = signIn.cookie
      .split(/,(?=\s*hcmue\.)/)
      .map((part) => part.split(";")[0].trim())
      .join("; ");
    for (const [path, body] of [
      ["/update-user", { name: "Tên giả" }],
      ["/update-user", { username: "5001104013" }],
      ["/is-username-available", { username: "5001104009" }],
      ["/forget-password/email-otp", { email: "khoatm@hcmue.edu.vn" }],
      ["/delete-user", {}],
    ] as const) {
      const response = await auth.handler(
        new Request(`${BASE_URL}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE_URL, cookie, "x-forwarded-for": nextIp(1) },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 404, path);
    }
    const [admin] = await db.select({ name: user.name, username: user.username }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    assert.equal(admin.name, "Trần Minh Khoa");
    assert.equal(admin.username, "cb0021");
  });

  test("câu báo tài khoản bị khóa bằng tiếng Việt", () => {
    assert.match(AUTH_ERROR_MESSAGE.BANNED_USER, /bị khóa/);
  });

  test("không có đăng ký và không đăng nhập bằng OTP", async () => {
    const signUp = await call("/sign-up/email", { email: "moi@hcmue.edu.vn", password: PASSWORD, name: "Người mới" });
    assert.notEqual(signUp.status, 200);
    const otpSignIn = await call("/sign-in/email-otp", { email: "khoatm@hcmue.edu.vn", otp: "000000" });
    assert.equal(otpSignIn.status, 404);
    assert.equal((await call("/email-otp/send-verification-otp", { email: "khoatm@hcmue.edu.vn", type: "email-verification" })).status, 404);
    assert.equal((await call("/email-otp/verify-email", { email: "khoatm@hcmue.edu.vn", otp: "000000" })).status, 404);
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

async function failTimes(username: string, times: number) {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) statuses.push((await call("/sign-in/username", { username, password: "sai-mat-khau" })).status);
  return statuses;
}

describe("khóa tạm theo tên đăng nhập", () => {
  test(`sai ${SIGN_IN_LOCKOUT.maxFailures} lần thì khóa tạm, kể cả đúng mật khẩu; đăng nhập đúng trước đó thì xóa bộ đếm`, async () => {
    try {
      assert.deepEqual(await failTimes(LECTURER_CODE, SIGN_IN_LOCKOUT.maxFailures - 1), Array(SIGN_IN_LOCKOUT.maxFailures - 1).fill(401));
      assert.equal((await failureRowOf("gv104011"))?.failures, SIGN_IN_LOCKOUT.maxFailures - 1);
      assert.equal((await call("/sign-in/username", { username: LECTURER_CODE.toLowerCase(), password: PASSWORD })).status, 200);
      assert.equal(await failureRowOf("gv104011"), undefined, "đăng nhập đúng xóa bộ đếm");

      assert.deepEqual(await failTimes(LECTURER_CODE, SIGN_IN_LOCKOUT.maxFailures), Array(SIGN_IN_LOCKOUT.maxFailures).fill(401));
      const locked = await call("/sign-in/username", { username: LECTURER_CODE, password: PASSWORD });
      assert.equal(locked.status, 429);
      assert.equal(locked.json?.code, "SIGN_IN_LOCKED");
      assert.match(locked.json?.message ?? "", /tạm khóa 15 phút/);
      assert.equal(authErrorMessage({ code: "SIGN_IN_LOCKED", status: 429 }), AUTH_ERROR_MESSAGE.SIGN_IN_LOCKED);
      assert.equal((await call("/sign-in/username", { username: " gv104011", password: PASSWORD })).json?.code, "SIGN_IN_LOCKED");

      await db
        .update(signInFailures)
        .set({ lockedUntil: sql`now() - interval '1 second'`, windowStartedAt: sql`now() - interval '30 minutes'` })
        .where(eq(signInFailures.username, "gv104011"));
      assert.equal((await call("/sign-in/username", { username: LECTURER_CODE, password: PASSWORD })).status, 200);
      assert.equal(await failureRowOf("gv104011"), undefined);
    } finally {
      await db.delete(signInFailures).where(eq(signInFailures.username, "gv104011"));
    }
  });

  test("tên không tồn tại cũng bị khóa tạm với cùng câu báo, không lộ tài khoản có hay không", async () => {
    assert.deepEqual(await failTimes(LOCKOUT_GHOST, SIGN_IN_LOCKOUT.maxFailures), Array(SIGN_IN_LOCKOUT.maxFailures).fill(401));
    const ghost = await call("/sign-in/username", { username: LOCKOUT_GHOST, password: PASSWORD });
    assert.equal(ghost.status, 429);
    assert.equal(ghost.json?.code, "SIGN_IN_LOCKED");
    assert.equal(ghost.json?.message, AUTH_ERROR_MESSAGE.SIGN_IN_LOCKED);
    assert.ok((await failureRowOf("tt9990001"))?.lockedUntil);
  });

  test("gửi song song nhiều lần sai cùng lúc cũng không lọt quá số lần cho phép", async () => {
    const results = await Promise.all(
      Array.from({ length: SIGN_IN_LOCKOUT.maxFailures + 5 }, () => call("/sign-in/username", { username: LOCKOUT_RACE, password: "sai-mat-khau" })),
    );
    const passed = results.filter((result) => result.status === 401).length;
    assert.ok(passed <= SIGN_IN_LOCKOUT.maxFailures, `${passed} lần được so mật khẩu`);
    assert.ok(results.every((result) => result.status === 401 || result.json?.code === "SIGN_IN_LOCKED"));
  });
});

describe("khôi phục mật khẩu", () => {
  test("gửi mã tới email trường, kiểm mã rồi đặt mật khẩu mới", async () => {
    const email = studentEmailOf(STUDENT_CODE);
    const warn = mock.method(console, "warn", () => {});
    try {
      assert.equal((await call("/email-otp/request-password-reset", { email })).status, 200);
      const otp = String(warn.mock.calls.at(-1)?.arguments[0]).match(/Portal: (\d{6})"/)?.[1];
      assert.ok(otp, "OTP được in ra log");

      const wrong = await call("/email-otp/check-verification-otp", { email, otp: otp === "000000" ? "111111" : "000000", type: "forget-password" });
      assert.equal(wrong.json?.code, "INVALID_OTP");
      assert.equal((await call("/email-otp/check-verification-otp", { email, otp, type: "forget-password" })).status, 200);
      const lockedUntil = new Date(Date.now() + 15 * 60_000);
      await db
        .insert(signInFailures)
        .values({ username: STUDENT_CODE, failures: SIGN_IN_LOCKOUT.maxFailures, windowStartedAt: new Date(), lockedUntil })
        .onConflictDoUpdate({ target: signInFailures.username, set: { lockedUntil } });
      assert.equal((await call("/email-otp/reset-password", { email, otp, password: "MatKhauMoi@2026" })).status, 200);
      assert.equal(await failureRowOf(STUDENT_CODE), undefined, "đặt lại mật khẩu xóa bộ đếm");

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
