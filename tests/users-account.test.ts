import assert from "node:assert/strict";
import { after, describe, mock, test } from "node:test";
import { and, eq, inArray, isNull, TransactionRollbackError } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { createAuth } from "@/modules/authentication/authentication.lib";
import { account, session, signInFailures, user } from "@/modules/authentication/authentication.schema";
import { mailOutbox } from "@/modules/mail/mail.schema";
import { createAccounts, lockAccountProfiles, queueActivationMails, randomPasswordHashes, readAccountStates, setAccountsLocked, staffProfile } from "@/modules/users/users.account";
import { accountBatchSummary, accountStatusOf, activationLink, activationMail, LECTURER_SCHEMA, STAFF_SCHEMA, studentAccountIdentity } from "@/modules/users/users.rule";
import { lecturers, staffMembers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const BASE_URL = env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL;
const NEW_PASSWORD = "KichHoat@2026";

// Tạo trong transaction rồi rollback: không để lại tài khoản thử làm lệch tests/seed.test.ts (đếm tài khoản sinh viên).
async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

let requestCount = 0;

// better-auth chạy trên chính transaction của test để thấy tài khoản vừa tạo (chưa commit).
function authClientOn(tx: Transaction) {
  const auth = createAuth(tx);
  return async (path: string, body: unknown) => {
    requestCount += 1;
    const response = await auth.handler(
      new Request(`${BASE_URL}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL, "x-forwarded-for": `10.7.0.${requestCount}` },
        body: JSON.stringify(body),
      }),
    );
    const json = (await response.json().catch(() => null)) as { code?: string; message?: string; user?: { role?: string; username?: string } } | null;
    return { status: response.status, json };
  };
}

describe("users: hàm thuần của tài khoản", () => {
  test("tài khoản sinh viên: username 10 chữ số, hiển thị có dấu chấm, email trường", () => {
    assert.deepEqual(studentAccountIdentity("50.01.104.013"), {
      username: "5001104013",
      displayUsername: "50.01.104.013",
      email: "5001104013@student.hcmue.edu.vn",
    });
    assert.deepEqual(studentAccountIdentity("5001104013"), studentAccountIdentity("50.01.104.013"));
  });

  test("trạng thái tài khoản: chưa cấp, chưa kích hoạt, đang dùng, đã khóa", () => {
    assert.equal(accountStatusOf({ userId: null, banned: null, lastSignInAt: null }), "none");
    assert.equal(accountStatusOf({ userId: "u", banned: false, lastSignInAt: null }), "pending");
    assert.equal(accountStatusOf({ userId: "u", banned: false, lastSignInAt: new Date() }), "active");
    assert.equal(accountStatusOf({ userId: "u", banned: true, lastSignInAt: new Date() }), "locked");
    assert.equal(accountStatusOf({ userId: "u", banned: true, lastSignInAt: null }), "locked");
  });

  test("thư kích hoạt có đường dẫn quên mật khẩu điền sẵn email, không chứa mật khẩu", () => {
    const link = activationLink("http://localhost:3000/", "5001104013@student.hcmue.edu.vn");
    assert.equal(link, "http://localhost:3000/authentication/forgot-password?email=5001104013%40student.hcmue.edu.vn&activate=1");
    const mail = activationMail({ name: "Nguyễn Văn An", loginName: "50.01.104.013", isStudent: true, link });
    assert.ok(mail.text.includes(link));
    assert.ok(mail.text.includes("50.01.104.013"));
    assert.ok(!/mật khẩu (là|ban đầu)/i.test(mail.text));
    const lecturerMail = activationMail({ name: "ThS. Phạm Thùy Hạnh", loginName: "GV104011", isStudent: false, link });
    assert.ok(lecturerMail.text.includes("Tên đăng nhập là mã số cán bộ, giảng viên: GV104011"));
    assert.ok(!lecturerMail.text.includes("Tên đăng nhập là email"));
  });

  test("câu báo thao tác hàng loạt gom dòng bỏ qua theo lý do", () => {
    const text = accountBatchSummary("provision", {
      changed: 2,
      mailed: 2,
      skipped: [{ reason: "Đã có tài khoản" }, { reason: "Đã có tài khoản" }],
    });
    assert.equal(text, "Đã cấp 2 tài khoản, gửi thư kích hoạt tới 2 người; bỏ qua 2 hồ sơ đã có tài khoản.");
  });

  test("cán bộ dùng email công vụ, không dùng email sinh viên", () => {
    assert.ok(STAFF_SCHEMA.safeParse({ code: "cb0105", fullName: "Lê Văn Bình", unit: "Phòng Đào tạo", email: "BinhLV@hcmue.edu.vn" }).success);
    assert.ok(!STAFF_SCHEMA.safeParse({ code: "CB0105", fullName: "A", unit: "B", email: "5001104013@student.hcmue.edu.vn" }).success);
    assert.ok(!STAFF_SCHEMA.safeParse({ code: "CB0105", fullName: "A", unit: "B", email: "a@gmail.com" }).success);
  });

  test("mã cán bộ, giảng viên là tên đăng nhập nên phải đúng dạng chữ cái rồi chữ số", () => {
    assert.equal(STAFF_SCHEMA.parse({ code: " cb0105 ", fullName: "Lê Văn Bình", unit: "Phòng Đào tạo", email: "binhlv@hcmue.edu.vn" }).code, "CB0105");
    for (const code of ["CB-0105", "Bình01", "0105", "CB 0105"]) {
      assert.ok(!STAFF_SCHEMA.safeParse({ code, fullName: "A", unit: "B", email: "binhlv@hcmue.edu.vn" }).success, code);
    }
    const lecturer = { fullName: "Lê Văn Bình", gender: "male", title: "ThS.", faculty: "Khoa Công nghệ Thông tin", email: "binhlv@hcmue.edu.vn", phone: "", status: "active" } as const;
    assert.equal(LECTURER_SCHEMA.parse({ ...lecturer, code: "gv104099" }).code, "GV104099");
    assert.ok(!LECTURER_SCHEMA.safeParse({ ...lecturer, code: "GV.104099" }).success);
  });
});

describe("users: cấp, kích hoạt, khóa tài khoản trên DB", () => {
  test("sinh viên được cấp tài khoản, kích hoạt bằng mã OTP rồi đăng nhập bằng MSSV; bị khóa thì chặn, mở khóa thì vào lại", async () => {
    const [student] = await db
      .select({ id: students.id, code: students.code })
      .from(students)
      .where(and(isNull(students.userId), eq(students.status, "studying")))
      .limit(1);
    assert.ok(student, "seed cần sinh viên chưa có tài khoản");
    const hashes = await randomPasswordHashes(1);
    let mailIds: string[] = [];
    await inRollback(async (tx) => {
      const profiles = await lockAccountProfiles(tx, "student", [student.id]);
      const { created, skipped } = await createAccounts(tx, profiles, hashes);
      assert.equal(created.length, 1);
      assert.equal(skipped.length, 0);
      const identity = studentAccountIdentity(student.code);

      const [row] = await tx.select().from(user).where(eq(user.id, created[0].userId));
      assert.equal(row.username, identity.username);
      assert.equal(row.displayUsername, identity.displayUsername);
      assert.equal(row.email, identity.email);
      assert.equal(row.role, "student");
      assert.equal(row.emailVerified, false);
      const [credential] = await tx.select().from(account).where(eq(account.userId, row.id));
      assert.equal(credential.providerId, "credential");
      assert.match(credential.password ?? "", /^[0-9a-f]+:[0-9a-f]+$/, "mật khẩu ban đầu chỉ lưu dạng băm");
      const [linked] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, student.id));
      assert.equal(linked.userId, row.id);
      assert.equal((await readAccountStates(tx, "student", [student.id]))[student.id].status, "pending");

      // Thư kích hoạt xếp hàng cùng transaction cấp tài khoản, chưa gửi; rollback thì thư cũng mất (kiểm sau inRollback).
      mailIds = await queueActivationMails(tx, created);
      const queued = await tx.select().from(mailOutbox).where(inArray(mailOutbox.id, mailIds));
      assert.equal(queued.length, 1);
      assert.equal(queued[0].recipient, identity.email);
      assert.equal(queued[0].kind, "account-activation");
      assert.equal(queued[0].status, "pending");
      assert.ok(queued[0].text.includes(activationLink(BASE_URL, identity.email)));

      // Cấp lần hai cho cùng hồ sơ: bỏ qua, không tạo tài khoản thứ hai.
      const again = await createAccounts(tx, await lockAccountProfiles(tx, "student", [student.id]), hashes);
      assert.equal(again.created.length, 0);

      const call = authClientOn(tx);
      const warn = mock.method(console, "warn", () => {});
      let otp: string | undefined;
      try {
        assert.equal((await call("/email-otp/request-password-reset", { email: identity.email })).status, 200);
        otp = String(warn.mock.calls.at(-1)?.arguments[0]).match(/Portal: (\d{6})"/)?.[1];
      } finally {
        warn.mock.restore();
      }
      assert.ok(otp, "mã kích hoạt được in ra log khi chưa có khóa Resend");
      assert.equal((await call("/email-otp/reset-password", { email: identity.email, otp, password: NEW_PASSWORD })).status, 200);

      const signIn = await call("/sign-in/username", { username: identity.displayUsername, password: NEW_PASSWORD });
      assert.equal(signIn.status, 200);
      assert.equal(signIn.json?.user?.role, "student");
      assert.equal((await readAccountStates(tx, "student", [student.id]))[student.id].status, "active");

      await setAccountsLocked(tx, [row.id], true, "Kiểm thử");
      assert.equal((await tx.select().from(session).where(eq(session.userId, row.id))).length, 0, "khóa thì thu hồi mọi phiên");
      const blocked = await call("/sign-in/username", { username: identity.username, password: NEW_PASSWORD });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.json?.code, "BANNED_USER");
      assert.match(blocked.json?.message ?? "", /bị khóa/);
      // Sai mật khẩu vẫn báo chung một câu, không lộ tài khoản đang bị khóa.
      assert.equal((await call("/sign-in/username", { username: identity.username, password: "sai-mat-khau" })).json?.code, "INVALID_USERNAME_OR_PASSWORD");
      assert.equal((await readAccountStates(tx, "student", [student.id]))[student.id].status, "locked");

      await setAccountsLocked(tx, [row.id], false, null);
      assert.equal((await call("/sign-in/username", { username: identity.username, password: NEW_PASSWORD })).status, 200);
    });
    const [afterRollback] = await db.select({ userId: students.userId }).from(students).where(eq(students.id, student.id));
    assert.equal(afterRollback.userId, null, "rollback không để lại tài khoản");
    assert.equal(mailIds.length, 1);
    assert.equal((await db.select({ id: mailOutbox.id }).from(mailOutbox).where(inArray(mailOutbox.id, mailIds))).length, 0, "rollback không để lại thư");
  });

  test("giảng viên được cấp tài khoản đăng nhập bằng mã giảng viên, không bằng email công vụ", async () => {
    const [lecturer] = await db.select({ id: lecturers.id, code: lecturers.code, email: lecturers.email }).from(lecturers).where(isNull(lecturers.userId)).limit(1);
    assert.ok(lecturer, "seed cần giảng viên chưa có tài khoản");
    const hashes = await randomPasswordHashes(1);
    await inRollback(async (tx) => {
      const [profile] = await lockAccountProfiles(tx, "lecturer", [lecturer.id]);
      assert.equal(profile.loginName, lecturer.code);
      const { created } = await createAccounts(tx, [profile], hashes);
      assert.equal(created.length, 1);
      const [row] = await tx.select().from(user).where(eq(user.id, created[0].userId));
      assert.equal(row.email, lecturer.email);
      assert.equal(row.username, lecturer.code.toLowerCase());
      assert.equal(row.displayUsername, lecturer.code);
      assert.equal(row.role, "lecturer");
      // Đặt mật khẩu như sau khi kích hoạt.
      await tx.update(account).set({ password: await hashPassword(NEW_PASSWORD) }).where(eq(account.userId, row.id));
      const call = authClientOn(tx);
      for (const username of [lecturer.code, lecturer.code.toLowerCase()]) {
        const signIn = await call("/sign-in/username", { username, password: NEW_PASSWORD });
        assert.equal(signIn.status, 200, username);
        assert.equal(signIn.json?.user?.role, "lecturer");
      }
      const viaEmail = await call("/sign-in/email", { email: lecturer.email, password: NEW_PASSWORD });
      assert.equal(viaEmail.status, 401);
      assert.equal(viaEmail.json?.code, "USE_LOGIN_CODE");

      // Mở khóa tài khoản thì gỡ luôn khóa tạm do đăng nhập sai nhiều lần.
      await tx.insert(signInFailures).values({ username: row.username!, failures: 10, windowStartedAt: new Date(), lockedUntil: new Date(Date.now() + 60_000) });
      assert.equal((await call("/sign-in/username", { username: lecturer.code, password: NEW_PASSWORD })).json?.code, "SIGN_IN_LOCKED");
      await setAccountsLocked(tx, [row.id], false, null);
      assert.equal((await tx.select().from(signInFailures).where(eq(signInFailures.username, row.username!))).length, 0);
      assert.equal((await call("/sign-in/username", { username: lecturer.code, password: NEW_PASSWORD })).status, 200);
    });
  });

  test("cán bộ mới được cấp tài khoản đăng nhập bằng mã cán bộ", async () => {
    const hashes = await randomPasswordHashes(1);
    await inRollback(async (tx) => {
      const [staff] = await tx
        .insert(staffMembers)
        .values({ code: "CB9901", fullName: "Lê Văn Kiểm Thử", unit: "Phòng Đào tạo", email: "kiemthu.cb9901@hcmue.edu.vn" })
        .returning({ id: staffMembers.id });
      const profile = staffProfile({ id: staff.id, userId: null, code: "CB9901", name: "Lê Văn Kiểm Thử", faculty: "", email: "kiemthu.cb9901@hcmue.edu.vn" }, "admin");
      const { created } = await createAccounts(tx, [profile], hashes);
      assert.equal(created.length, 1);
      const [row] = await tx.select().from(user).where(eq(user.id, created[0].userId));
      assert.equal(row.username, "cb9901");
      assert.equal(row.displayUsername, "CB9901");
      const [linked] = await tx.select({ userId: staffMembers.userId }).from(staffMembers).where(eq(staffMembers.id, staff.id));
      assert.equal(linked.userId, row.id);
      await tx.update(account).set({ password: await hashPassword(NEW_PASSWORD) }).where(eq(account.userId, row.id));
      const signIn = await authClientOn(tx)("/sign-in/username", { username: "cb9901", password: NEW_PASSWORD });
      assert.equal(signIn.status, 200);
      assert.equal(signIn.json?.user?.role, "admin");
    });
  });

  test("mã đã là tên đăng nhập của tài khoản khác thì bỏ qua hồ sơ, báo ở ô mã", async () => {
    const [lecturer] = await db.select({ id: lecturers.id }).from(lecturers).where(isNull(lecturers.userId)).limit(1);
    const hashes = await randomPasswordHashes(1);
    await inRollback(async (tx) => {
      const [profile] = await lockAccountProfiles(tx, "lecturer", [lecturer.id]);
      const { created, skipped } = await createAccounts(tx, [{ ...profile, username: "cb0021", loginName: "CB0021" }], hashes);
      assert.equal(created.length, 0);
      assert.equal(skipped[0].field, "code");
      assert.match(skipped[0].reason, /CB0021 đã là tên đăng nhập/);
    });
  });

  test("email đã thuộc tài khoản khác thì bỏ qua hồ sơ, không ghi nửa chừng", async () => {
    const [lecturer] = await db.select({ id: lecturers.id }).from(lecturers).where(isNull(lecturers.userId)).limit(1);
    const hashes = await randomPasswordHashes(1);
    await inRollback(async (tx) => {
      const [profile] = await lockAccountProfiles(tx, "lecturer", [lecturer.id]);
      const { created, skipped } = await createAccounts(tx, [{ ...profile, email: "khoatm@hcmue.edu.vn" }], hashes);
      assert.equal(created.length, 0);
      assert.match(skipped[0].reason, /đã thuộc một tài khoản khác/);
      assert.equal(skipped[0].field, "email");
      const [linked] = await tx.select({ userId: lecturers.userId }).from(lecturers).where(eq(lecturers.id, lecturer.id));
      assert.equal(linked.userId, null);
    });
  });
});
