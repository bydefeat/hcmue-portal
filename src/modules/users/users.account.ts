import "server-only";
import { randomBytes } from "node:crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { account, session, signInFailures, user } from "@/modules/authentication/authentication.schema";
import { staffAccountIdentity } from "@/shared/libs/login-name.lib";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { enqueueMail } from "@/modules/mail/mail.lib";
import { accountStatusOf, activationLink, activationMail, studentAccountIdentity } from "@/modules/users/users.rule";
import { administrativeClasses, lecturers, staffMembers, students } from "@/modules/users/users.schema";
import type { AccountKind, AccountState } from "@/modules/users/users.type";

type Database = typeof db | Transaction;

// Hồ sơ cần tài khoản: loginName là chữ người dùng gõ ở ô đăng nhập (MSSV có dấu chấm, mã cán bộ, giảng viên chữ hoa).
export type AccountProfile = {
  id: string;
  userId: string | null;
  name: string;
  faculty: string;
  email: string;
  username: string | null;
  displayUsername: string | null;
  loginName: string;
  role: "student" | "lecturer" | "admin";
};

export type NewAccount = AccountProfile & { userId: string };

const HASH_BATCH = 25;

// Mật khẩu ban đầu ngẫu nhiên, không hiện cho ai và không lưu dạng rõ: người dùng tự đặt qua "Kích hoạt tài khoản".
// Băm trước khi mở transaction vì băm 1000 mật khẩu mất vài chục giây, giữ transaction lâu sẽ bị idle timeout.
export async function randomPasswordHashes(count: number) {
  const hashes: string[] = [];
  for (let start = 0; start < count; start += HASH_BATCH) {
    const size = Math.min(HASH_BATCH, count - start);
    hashes.push(...(await Promise.all(Array.from({ length: size }, () => hashPassword(randomBytes(24).toString("base64url"))))));
  }
  return hashes;
}

function studentProfile(row: { id: string; userId: string | null; code: string; name: string; faculty: string }): AccountProfile {
  const identity = studentAccountIdentity(row.code);
  return { ...row, ...identity, loginName: identity.displayUsername, role: "student" };
}

// Đọc hồ sơ theo id, khóa dòng hồ sơ (FOR UPDATE) để hai người cùng bấm cấp tài khoản không tạo hai tài khoản.
export async function lockAccountProfiles(tx: Transaction, kind: AccountKind, ids: string[]): Promise<AccountProfile[]> {
  if (ids.length === 0) return [];
  if (kind === "student") {
    const rows = await tx
      .select({ id: students.id, userId: students.userId, code: students.code, name: students.fullName, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(inArray(students.id, ids))
      .for("update", { of: students });
    return rows.map(studentProfile);
  }
  const rows = await tx
    .select({ id: lecturers.id, userId: lecturers.userId, code: lecturers.code, title: lecturers.title, fullName: lecturers.fullName, email: lecturers.email, faculty: faculties.name })
    .from(lecturers)
    .innerJoin(faculties, eq(faculties.id, lecturers.facultyId))
    .where(inArray(lecturers.id, ids))
    .for("update", { of: lecturers });
  return rows.map(({ title, fullName, code, ...row }) => staffProfile({ ...row, code, name: `${title} ${fullName}` }, "lecturer"));
}

// Giảng viên, cán bộ đăng nhập bằng mã hồ sơ; email công vụ chỉ để nhận mã kích hoạt, đặt lại mật khẩu.
export function staffProfile(
  row: { id: string; userId: string | null; code: string; name: string; faculty: string; email: string },
  role: "lecturer" | "admin",
): AccountProfile {
  const { code, ...rest } = row;
  const identity = staffAccountIdentity(code);
  return { ...rest, ...identity, loginName: identity.displayUsername, role };
}

// Tạo user + account (credential) cho các hồ sơ chưa có tài khoản và gắn userId vào hồ sơ.
// Email hoặc mã số đã thuộc tài khoản khác thì bỏ qua dòng đó; unique ở DB chặn lần cuối khi tranh nhau.
export async function createAccounts(tx: Transaction, profiles: AccountProfile[], hashes: string[]) {
  const pending = profiles.filter((profile) => profile.userId === null);
  const skipped: { profile: AccountProfile; reason: string; field: "email" | "code" }[] = [];
  if (pending.length === 0) return { created: [] as NewAccount[], skipped };
  if (hashes.length < pending.length) throw new Error("Thiếu mật khẩu ban đầu cho tài khoản mới");
  const emails = pending.map((profile) => profile.email.toLowerCase());
  const usernames = pending.flatMap((profile) => (profile.username ? [profile.username] : []));
  const taken = await tx
    .select({ email: user.email, username: user.username })
    .from(user)
    .where(usernames.length > 0 ? or(inArray(user.email, emails), inArray(user.username, usernames)) : inArray(user.email, emails));
  const takenEmails = new Set(taken.map((row) => row.email.toLowerCase()));
  const takenUsernames = new Set(taken.flatMap((row) => (row.username ? [row.username] : [])));
  const fresh: AccountProfile[] = [];
  for (const profile of pending) {
    if (takenEmails.has(profile.email.toLowerCase())) skipped.push({ profile, reason: `Email ${profile.email} đã thuộc một tài khoản khác`, field: "email" });
    else if (profile.username && takenUsernames.has(profile.username)) skipped.push({ profile, reason: `Mã ${profile.loginName} đã là tên đăng nhập của một tài khoản khác`, field: "code" });
    else fresh.push(profile);
  }
  if (fresh.length === 0) return { created: [] as NewAccount[], skipped };

  const users = await tx
    .insert(user)
    .values(
      fresh.map((profile) => ({
        name: profile.name,
        email: profile.email.toLowerCase(),
        username: profile.username,
        displayUsername: profile.displayUsername,
        emailVerified: false,
        role: profile.role,
      })),
    )
    .returning({ id: user.id, email: user.email });
  const userIdOf = new Map(users.map((row) => [row.email, row.id]));
  const created = fresh.map((profile) => ({ ...profile, userId: userIdOf.get(profile.email.toLowerCase())! }));
  await tx.insert(account).values(created.map((entry, index) => ({ userId: entry.userId, accountId: entry.userId, providerId: "credential", password: hashes[index] })));
  for (const entry of created) {
    if (entry.role === "student") await tx.update(students).set({ userId: entry.userId }).where(eq(students.id, entry.id));
    else if (entry.role === "lecturer") await tx.update(lecturers).set({ userId: entry.userId }).where(eq(lecturers.id, entry.id));
    else await tx.update(staffMembers).set({ userId: entry.userId }).where(eq(staffMembers.id, entry.id));
  }
  return { created, skipped };
}

// Khóa thì thu hồi luôn mọi phiên đang mở; getSession() kiểm lại cờ khóa nên cookie cache cũng hết hiệu lực ngay.
export async function setAccountsLocked(tx: Transaction, userIds: string[], locked: boolean, reason: string | null) {
  if (userIds.length === 0) return;
  await tx
    .update(user)
    .set({ banned: locked, banReason: locked ? reason : null, banExpires: null })
    .where(inArray(user.id, userIds));
  if (locked) await tx.delete(session).where(inArray(session.userId, userIds));
  // Mở khóa thì gỡ luôn khóa tạm do đăng nhập sai nhiều lần.
  else {
    const usernames = tx.select({ username: user.username }).from(user).where(inArray(user.id, userIds));
    await tx.delete(signInFailures).where(inArray(signInFailures.username, usernames));
  }
}

// Xếp thư kích hoạt vào hàng đợi trong transaction cấp tài khoản: rollback thì không có thư, commit thì thư chắc chắn được gửi (có gửi lại).
// Mỗi người một đường dẫn riêng (điền sẵn email) nên mỗi người một thư. Trả id thư để kích gửi ngay sau commit.
export async function queueActivationMails(tx: Transaction, accounts: Pick<AccountProfile, "name" | "email" | "loginName" | "role">[]) {
  return enqueueMail(
    tx,
    accounts.map((entry) => ({
      kind: "account-activation",
      to: entry.email,
      ...activationMail({
        name: entry.name,
        loginName: entry.loginName,
        isStudent: entry.role === "student",
        link: activationLink(env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL, entry.email),
      }),
    })),
  );
}

// Trạng thái tài khoản theo id hồ sơ; không truyền ids thì đọc mọi hồ sơ của loại đó.
export async function readAccountStates(database: Database, kind: AccountKind, ids?: string[]): Promise<Record<string, AccountState>> {
  if (ids && ids.length === 0) return {};
  const profile = kind === "student" ? students : lecturers;
  const rows = await database
    .select({ id: profile.id, userId: profile.userId, banned: user.banned, lastSignInAt: user.lastSignInAt })
    .from(profile)
    .leftJoin(user, eq(user.id, profile.userId))
    .where(ids ? inArray(profile.id, ids) : undefined);
  return Object.fromEntries(
    rows.map((row) => [row.id, { status: accountStatusOf(row), lastSignInAt: row.lastSignInAt?.toISOString() ?? null } satisfies AccountState]),
  );
}

// Giữ tên hiển thị và email đăng nhập khớp hồ sơ khi sửa hồ sơ đã có tài khoản.
export async function syncAccountProfile(tx: Transaction, userId: string | null, values: { name: string; email?: string }) {
  if (!userId) return;
  await tx
    .update(user)
    .set({ name: values.name, ...(values.email ? { email: values.email.toLowerCase(), emailVerified: sql`${user.email} = ${values.email.toLowerCase()} AND ${user.emailVerified}` } : {}) })
    .where(eq(user.id, userId));
}
