"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { studentEmailOf } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { auditActorOf, recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { deliverMailSoon } from "@/modules/mail/mail.lib";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { ACCOUNT_STATUS, NO_ACCOUNT, USERS_CONSTRAINT_MESSAGE } from "@/modules/users/users.constant";
import { getCurrentLecturer, getCurrentStudent, getDecisions, getLecturer, getStudent } from "@/modules/users/users.query";
import {
  createAccounts,
  lockAccountProfiles,
  randomPasswordHashes,
  readAccountStates,
  queueActivationMails,
  setAccountsLocked,
  staffProfile,
  syncAccountProfile,
  type AccountProfile,
  type NewAccount,
} from "@/modules/users/users.account";
import {
  ACCOUNT_BATCH_SCHEMA,
  DECISION_SCHEMA,
  LECTURER_CONTACT_SCHEMA,
  LECTURER_SCHEMA,
  STAFF_SCHEMA,
  STUDENT_CONTACT_SCHEMA,
  STUDENT_SCHEMA,
  type AccountBatchInput,
  type DecisionInput,
  type LecturerContactInput,
  type LecturerInput,
  type StaffInput,
  type StudentContactInput,
  type StudentInput,
} from "@/modules/users/users.rule";
import { administrativeClasses, lecturers, staffMembers, studentDecisions, students } from "@/modules/users/users.schema";
import type {
  AccountBatchResult,
  AccountKind,
  AccountState,
  DecisionKind,
  Lecturer,
  MailOutcome,
  SavedProfile,
  Student,
  StudentDecision,
  StudentStatus,
} from "@/modules/users/users.type";

class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function failure(error: unknown) {
  if (error instanceof InputError) return actionError(error.message, { [error.field]: error.message });
  return actionFailure(error, USERS_CONSTRAINT_MESSAGE);
}

// Lớp sinh hoạt theo mã; chưa có thì tạo mới cho ngành và khóa của sinh viên, có rồi thì phải đúng ngành và khóa.
async function classIdFor(tx: Transaction, className: string, majorCode: string, cohort: number) {
  const [major] = await tx
    .select({ id: majors.id, faculty: faculties.name })
    .from(majors)
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(majors.code, majorCode));
  if (!major) throw new InputError("majorCode", "Ngành không có trong danh mục");
  const [existing] = await tx.select().from(administrativeClasses).where(eq(administrativeClasses.code, className));
  if (existing) {
    if (existing.majorId !== major.id || existing.cohort !== cohort) throw new InputError("className", `Lớp ${className} thuộc ngành hoặc khóa khác`);
    return { classId: existing.id, faculty: major.faculty };
  }
  const [created] = await tx.insert(administrativeClasses).values({ code: className, majorId: major.id, cohort }).returning({ id: administrativeClasses.id });
  return { classId: created.id, faculty: major.faculty };
}

function studentColumns(values: z.output<typeof STUDENT_SCHEMA>, classId: string) {
  return {
    fullName: values.fullName,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth,
    email: values.email || studentEmailOf(values.code),
    phone: values.phone,
    administrativeClassId: classId,
    status: values.status,
  };
}

const ENTITY_OF = { student: "student", lecturer: "lecturer" } as const;

// Ghi nhật ký cấp tài khoản và xếp thư kích hoạt trong cùng transaction: rollback thì không còn dòng nhật ký hay thư nào.
// Trả id thư để gửi ngay sau commit.
async function recordCreatedAccounts(tx: Transaction, actor: AuditActor, created: NewAccount[]) {
  for (const entry of created) {
    await recordAudit(tx, {
      actor,
      action: "create",
      entityType: entry.role === "admin" ? "role" : ENTITY_OF[entry.role],
      entityId: entry.id,
      entityLabel: `${entry.loginName} ${entry.name}`,
      summary: `Cấp tài khoản đăng nhập ${entry.loginName}, gửi thư kích hoạt tới ${entry.email}`,
    });
  }
  return queueActivationMails(tx, created);
}

// Gọi sau commit: thư đã nằm trong hàng đợi, gửi ngay sau khi trả phản hồi; lỗi thì tác vụ mail-outbox gửi lại.
function sendQueuedMails(mailIds: string[]): MailOutcome | null {
  deliverMailSoon(mailIds);
  return mailIds.length > 0 ? { queued: mailIds.length } : null;
}

export async function saveStudent(
  id: string | null,
  input: StudentInput,
  options: { provisionAccount?: boolean } = {},
): Promise<ActionResult<SavedProfile<Student>>> {
  const viewer = await requirePermission("students.manage");
  if (id !== null && !isUuid(id)) return actionError("Sinh viên không còn tồn tại, tải lại trang.");
  const parsed = parseInput(STUDENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  const provision = id === null && options.provisionAccount === true;
  const hashes = provision ? await randomPasswordHashes(1) : [];
  let studentId: string;
  let mailIds: string[] = [];
  try {
    ({ studentId, mailIds } = await db.transaction(async (tx) => {
      const { classId, faculty } = await classIdFor(tx, values.className, values.majorCode, values.cohort);
      if (!inScope(viewer, faculty)) throw new InputError("majorCode", "Ngành thuộc khoa khác, bạn không quản lý hồ sơ này");
      // Sửa hồ sơ: khoa hiện tại của sinh viên cũng phải trong phạm vi, không thì chuyển được sinh viên khoa khác về khoa mình.
      const [current] = id ? await lockAccountProfiles(tx, "student", [id]) : [];
      if (current && !inScope(viewer, current.faculty)) throw new InputError("majorCode", "Sinh viên thuộc khoa khác, bạn không sửa được hồ sơ này");
      // MSSV không đổi sau khi tạo vì đã gắn với điểm, đăng ký và tài khoản đăng nhập.
      const [row] = id
        ? await tx.update(students).set(studentColumns(values, classId)).where(eq(students.id, id)).returning({ id: students.id, userId: students.userId })
        : await tx
            .insert(students)
            .values({ ...studentColumns(values, classId), code: values.code })
            .returning({ id: students.id, userId: students.userId });
      if (!row) throw new InputError("code", "Sinh viên không còn tồn tại, tải lại trang.");
      await syncAccountProfile(tx, row.userId, { name: values.fullName });
      if (!provision) return { studentId: row.id, mailIds: [] };
      const result = await createAccounts(tx, await lockAccountProfiles(tx, "student", [row.id]), hashes);
      if (result.skipped.length > 0) throw new InputError("code", result.skipped[0].reason);
      return { studentId: row.id, mailIds: await recordCreatedAccounts(tx, auditActorOf(viewer), result.created) };
    }));
  } catch (error) {
    return failure(error);
  }
  const mail = sendQueuedMails(mailIds);
  revalidatePath("/administrator/users/students", "layout");
  const [student, accounts] = await Promise.all([getStudent(studentId), readAccountStates(db, "student", [studentId])]);
  return student
    ? actionOk({ profile: student, account: accounts[studentId] ?? NO_ACCOUNT, mail })
    : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Nhập nhiều sinh viên một lần: một dòng lỗi thì không dòng nào được ghi, để file nhập lại không bị trùng nửa chừng.
export async function importStudents(
  inputs: StudentInput[],
  options: { provisionAccounts?: boolean } = {},
): Promise<ActionResult<{ students: (Student & { account: AccountState })[]; accountsCreated: number; mail: MailOutcome | null }>> {
  const viewer = await requirePermission("students.manage");
  if (inputs.length === 0 || inputs.length > 2000) return actionError("Mỗi lần nhập từ 1 đến 2000 sinh viên.");
  const rows: z.output<typeof STUDENT_SCHEMA>[] = [];
  for (const [index, input] of inputs.entries()) {
    const parsed = STUDENT_SCHEMA.safeParse(input);
    if (!parsed.success) return actionError(`Dòng ${index + 1}: ${parsed.error.issues[0].message}`);
    rows.push(parsed.data);
  }
  const hashes = options.provisionAccounts ? await randomPasswordHashes(rows.length) : [];
  let ids: string[];
  let created: NewAccount[] = [];
  let mailIds: string[] = [];
  try {
    ({ ids, created, mailIds } = await db.transaction(async (tx) => {
      const inserted: string[] = [];
      for (const [index, values] of rows.entries()) {
        const { classId, faculty } = await classIdFor(tx, values.className, values.majorCode, values.cohort).catch((error: unknown) => {
          throw error instanceof InputError ? new InputError(error.field, `Dòng ${index + 1}: ${error.message}`) : error;
        });
        if (!inScope(viewer, faculty)) throw new InputError("file", `Dòng ${index + 1}: ngành thuộc khoa khác`);
        const [row] = await tx
          .insert(students)
          .values({ ...studentColumns(values, classId), code: values.code })
          .returning({ id: students.id });
        inserted.push(row.id);
      }
      if (!options.provisionAccounts) return { ids: inserted, created: [], mailIds: [] };
      // MSSV, email trùng tài khoản cũ thì hồ sơ vẫn được nhập, chỉ không cấp tài khoản; bảng hiện "Chưa cấp".
      const result = await createAccounts(tx, await lockAccountProfiles(tx, "student", inserted), hashes);
      return { ids: inserted, created: result.created, mailIds: await recordCreatedAccounts(tx, auditActorOf(viewer), result.created) };
    }));
  } catch (error) {
    return failure(error);
  }
  const mail = sendQueuedMails(mailIds);
  revalidatePath("/administrator/users/students", "layout");
  const [all, accounts] = await Promise.all([Promise.all(ids.map((id) => getStudent(id))), readAccountStates(db, "student", ids)]);
  return actionOk({
    students: all.filter((student) => student !== null).map((student) => ({ ...student, account: accounts[student.id] ?? NO_ACCOUNT })),
    accountsCreated: created.length,
    mail,
  });
}

export async function setStudentsStatus(ids: string[], status: StudentStatus): Promise<ActionResult<{ updated: number }>> {
  const viewer = await requirePermission("students.manage");
  const parsed = z.object({ ids: z.array(z.uuid()).min(1).max(1000), status: z.enum(["studying", "reserved", "suspended", "graduated"]) }).safeParse({ ids, status });
  if (!parsed.success) return actionError("Chọn sinh viên và trạng thái hợp lệ.");
  try {
    const rows = await db
      .select({ id: students.id, faculty: faculties.name })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .innerJoin(faculties, eq(faculties.id, majors.facultyId))
      .where(inArray(students.id, parsed.data.ids));
    if (rows.some((row) => !inScope(viewer, row.faculty))) return actionError("Có sinh viên thuộc khoa khác, bạn không đổi trạng thái được.");
    const updated = await db.update(students).set({ status: parsed.data.status }).where(inArray(students.id, parsed.data.ids)).returning({ id: students.id });
    revalidatePath("/administrator/users/students", "layout");
    return actionOk({ updated: updated.length });
  } catch (error) {
    return failure(error);
  }
}

export async function saveLecturer(
  id: string | null,
  input: LecturerInput,
  options: { provisionAccount?: boolean } = {},
): Promise<ActionResult<SavedProfile<Lecturer>>> {
  const viewer = await requirePermission("lecturers.manage");
  if (id !== null && !isUuid(id)) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
  const parsed = parseInput(LECTURER_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { faculty, code, ...values } = parsed.data;
  const provision = id === null && options.provisionAccount === true;
  const hashes = provision ? await randomPasswordHashes(1) : [];
  let lecturerId: string;
  let mailIds: string[] = [];
  try {
    const [facultyRow] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty));
    if (!facultyRow) return actionError("Khoa không có trong danh mục", { faculty: "Khoa không có trong danh mục" });
    if (!inScope(viewer, faculty)) return actionError("Khoa này ngoài phạm vi bạn quản lý.", { faculty: "Khoa này ngoài phạm vi bạn quản lý" });
    const outcome = await db.transaction(async (tx) => {
      const [current] = id ? await lockAccountProfiles(tx, "lecturer", [id]) : [];
      if (current && !inScope(viewer, current.faculty)) throw new InputError("faculty", "Giảng viên thuộc khoa khác, bạn không sửa được hồ sơ này");
      const [row] = id
        ? await tx
            .update(lecturers)
            .set({ ...values, facultyId: facultyRow.id })
            .where(eq(lecturers.id, id))
            .returning({ id: lecturers.id, userId: lecturers.userId })
        : await tx
            .insert(lecturers)
            .values({ ...values, code, facultyId: facultyRow.id })
            .returning({ id: lecturers.id, userId: lecturers.userId });
      if (!row) return null;
      // Mã giảng viên (cũng là tên đăng nhập) không đổi sau khi tạo: ô mã khóa khi sửa và câu update không ghi cột code.
      // Email công vụ nhận mã kích hoạt, đặt lại mật khẩu: đổi ở hồ sơ thì đổi luôn email của tài khoản.
      await syncAccountProfile(tx, row.userId, { name: `${values.title} ${values.fullName}`, email: values.email });
      if (!provision) return { lecturerId: row.id, mailIds: [] };
      const result = await createAccounts(tx, await lockAccountProfiles(tx, "lecturer", [row.id]), hashes);
      if (result.skipped.length > 0) throw new InputError(result.skipped[0].field, result.skipped[0].reason);
      return { lecturerId: row.id, mailIds: await recordCreatedAccounts(tx, auditActorOf(viewer), result.created) };
    });
    if (!outcome) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
    ({ lecturerId, mailIds } = outcome);
  } catch (error) {
    return failure(error);
  }
  const mail = sendQueuedMails(mailIds);
  revalidatePath("/administrator/users/lecturers");
  const [lecturer, accounts] = await Promise.all([getLecturer(lecturerId), readAccountStates(db, "lecturer", [lecturerId])]);
  return lecturer
    ? actionOk({ profile: lecturer, account: accounts[lecturerId] ?? NO_ACCOUNT, mail })
    : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

const MANAGE_PERMISSION = { student: "students.manage", lecturer: "lecturers.manage" } as const;
const PAGE_OF = { student: "/administrator/users/students", lecturer: "/administrator/users/lecturers" } as const;
const OUT_OF_SCOPE = "Có hồ sơ thuộc khoa khác, bạn không quản lý tài khoản của hồ sơ đó. Bỏ chọn rồi thử lại.";

type Skipped = { profile: AccountProfile; reason: string };

// Quyền theo loại hồ sơ, đọc trước khi parse vì phải biết loại mới biết cần quyền nào; loại sai thì parse chặn ngay sau.
function permissionFor(input: { kind?: unknown } | null | undefined) {
  return MANAGE_PERMISSION[input?.kind === "lecturer" ? "lecturer" : "student"];
}

function outOfScope(viewer: { faculty: string | null }, profiles: AccountProfile[]) {
  return profiles.some((profile) => !inScope(viewer, profile.faculty));
}

async function batchResult(kind: AccountKind, ids: string[], changed: number, mail: MailOutcome | null, skipped: Skipped[]) {
  return actionOk<AccountBatchResult>({
    accounts: await readAccountStates(db, kind, ids),
    changed,
    mailed: mail?.queued ?? 0,
    skipped: skipped.map(({ profile, reason }) => ({ id: profile.id, name: profile.name, reason })),
  });
}

// Cấp tài khoản cho các hồ sơ đã chọn; hồ sơ đã có tài khoản thì bỏ qua. Thư kích hoạt gửi sau khi commit.
export async function provisionAccounts(input: AccountBatchInput): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requirePermission(permissionFor(input));
  const parsed = parseInput(ACCOUNT_BATCH_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { kind, ids } = parsed.data;
  let created: NewAccount[];
  let skipped: Skipped[];
  let mailIds: string[];
  try {
    const missing = await readAccountStates(db, kind, ids);
    const hashes = await randomPasswordHashes(ids.filter((id) => missing[id]?.status === "none").length);
    const outcome = await db.transaction(async (tx) => {
      const profiles = await lockAccountProfiles(tx, kind, ids);
      if (outOfScope(viewer, profiles)) return null;
      // Hồ sơ vừa được người khác cấp giữa lúc đọc và lúc khóa dòng: createAccounts chỉ tạo cho dòng còn trống, thiếu mật khẩu thì báo thử lại.
      const result = await createAccounts(tx, profiles, hashes);
      const queued = await recordCreatedAccounts(tx, auditActorOf(viewer), result.created);
      const existing = profiles.filter((profile) => profile.userId !== null).map((profile) => ({ profile, reason: "Đã có tài khoản" }));
      return { created: result.created, skipped: [...existing, ...result.skipped], mailIds: queued };
    });
    if (!outcome) return actionError(OUT_OF_SCOPE);
    ({ created, skipped, mailIds } = outcome);
  } catch (error) {
    return failure(error);
  }
  if (created.length === 0) return actionError(skipped.length > 0 ? `Không cấp thêm tài khoản nào: ${skipped[0].profile.name}, ${skipped[0].reason.toLowerCase()}.` : "Không còn hồ sơ nào trong các dòng đã chọn, tải lại trang.");
  const mail = sendQueuedMails(mailIds);
  revalidatePath(PAGE_OF[kind]);
  return batchResult(kind, ids, created.length, mail, skipped);
}

// Gửi lại thư kích hoạt cho tài khoản đã cấp mà chưa từng đăng nhập.
export async function resendActivation(input: AccountBatchInput): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requirePermission(permissionFor(input));
  const parsed = parseInput(ACCOUNT_BATCH_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { kind, ids } = parsed.data;
  let targets: AccountProfile[];
  let skipped: Skipped[];
  let mailIds: string[];
  try {
    const outcome = await db.transaction(async (tx) => {
      const profiles = await lockAccountProfiles(tx, kind, ids);
      if (outOfScope(viewer, profiles)) return null;
      const states = await readAccountStates(tx, kind, ids);
      const statusOf = (profile: AccountProfile) => states[profile.id]?.status ?? "none";
      const pending = profiles.filter((profile) => statusOf(profile) === "pending");
      return {
        targets: pending,
        skipped: profiles
          .filter((profile) => statusOf(profile) !== "pending")
          .map((profile) => ({ profile, reason: `Tài khoản ${ACCOUNT_STATUS[statusOf(profile)].label.toLowerCase()}` })),
        mailIds: await queueActivationMails(tx, pending),
      };
    });
    if (!outcome) return actionError(OUT_OF_SCOPE);
    ({ targets, skipped, mailIds } = outcome);
  } catch (error) {
    return failure(error);
  }
  if (targets.length === 0) {
    return actionError("Không có tài khoản nào đang chờ kích hoạt trong các dòng đã chọn. Thư kích hoạt chỉ gửi lại cho tài khoản đã cấp mà chưa đăng nhập lần nào.");
  }
  const mail = sendQueuedMails(mailIds);
  return batchResult(kind, ids, targets.length, mail, skipped);
}

// Khóa: chặn đăng nhập và thu hồi mọi phiên đang mở. Mở khóa: đăng nhập lại được bằng mật khẩu cũ.
export async function setAccountLock(input: AccountBatchInput & { locked: boolean }): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requirePermission(permissionFor(input));
  const parsed = parseInput(ACCOUNT_BATCH_SCHEMA.extend({ locked: z.boolean() }), input);
  if (!parsed.ok) return parsed;
  const { kind, ids, locked } = parsed.data;
  let changed: AccountProfile[];
  let skipped: Skipped[];
  try {
    const outcome = await db.transaction(async (tx) => {
      const profiles = await lockAccountProfiles(tx, kind, ids);
      if (outOfScope(viewer, profiles)) return "scope" as const;
      if (locked && profiles.some((profile) => profile.userId === viewer.id)) return "self" as const;
      const states = await readAccountStates(tx, kind, ids);
      const statusOf = (profile: AccountProfile) => states[profile.id]?.status ?? "none";
      const target = profiles.filter((profile) => (locked ? ["pending", "active"].includes(statusOf(profile)) : statusOf(profile) === "locked"));
      const rest = profiles
        .filter((profile) => !target.includes(profile))
        .map((profile) => ({ profile, reason: profile.userId ? (locked ? "Đã khóa từ trước" : "Tài khoản không bị khóa") : "Chưa cấp tài khoản" }));
      await setAccountsLocked(
        tx,
        target.map((profile) => profile.userId!),
        locked,
        `Khóa bởi ${viewer.name}, ${viewer.roleName}`,
      );
      for (const profile of target) {
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "permission",
          entityType: ENTITY_OF[kind],
          entityId: profile.id,
          entityLabel: `${profile.loginName} ${profile.name}`,
          summary: locked ? `Khóa tài khoản đăng nhập ${profile.loginName}, thu hồi các phiên đang mở` : `Mở khóa tài khoản đăng nhập ${profile.loginName}`,
          changes: [{ field: "Tài khoản", before: locked ? "Đang mở" : "Đã khóa", after: locked ? "Đã khóa" : "Đang mở" }],
        });
      }
      return { changed: target, skipped: rest };
    });
    if (outcome === "scope") return actionError(OUT_OF_SCOPE);
    if (outcome === "self") return actionError("Không khóa được tài khoản của chính bạn. Bỏ chọn hồ sơ của mình rồi thử lại.");
    ({ changed, skipped } = outcome);
  } catch (error) {
    return failure(error);
  }
  if (changed.length === 0) {
    return actionError(locked ? "Các dòng đã chọn chưa có tài khoản hoặc đã khóa từ trước." : "Các dòng đã chọn không có tài khoản nào đang bị khóa.");
  }
  revalidatePath(PAGE_OF[kind]);
  return batchResult(kind, ids, changed.length, null, skipped);
}

// Cán bộ mới (Phòng Đào tạo, văn phòng khoa...) kèm tài khoản vai trò "admin"; quyền cụ thể cấp ở trang Phân quyền.
export async function createStaffMember(input: StaffInput): Promise<ActionResult<{ id: string; name: string; hasAccount: boolean; mail: MailOutcome | null }>> {
  const viewer = await requirePermission("access.manage");
  if (viewer.faculty !== null) return actionError("Chỉ quản trị phạm vi toàn trường được thêm cán bộ.");
  const parsed = parseInput(STAFF_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { provisionAccount, ...values } = parsed.data;
  const hashes = provisionAccount ? await randomPasswordHashes(1) : [];
  let staffId: string;
  let mailIds: string[] = [];
  try {
    ({ staffId, mailIds } = await db.transaction(async (tx) => {
      const [row] = await tx.insert(staffMembers).values(values).returning({ id: staffMembers.id });
      if (!provisionAccount) return { staffId: row.id, mailIds: [] };
      const profile = staffProfile({ id: row.id, userId: null, code: values.code, name: values.fullName, faculty: "", email: values.email }, "admin");
      const result = await createAccounts(tx, [profile], hashes);
      if (result.skipped.length > 0) throw new InputError(result.skipped[0].field, result.skipped[0].reason);
      return { staffId: row.id, mailIds: await recordCreatedAccounts(tx, auditActorOf(viewer), result.created) };
    }));
  } catch (error) {
    return failure(error);
  }
  const mail = sendQueuedMails(mailIds);
  revalidatePath("/administrator/settings/access");
  return actionOk({ id: staffId, name: values.fullName, hasAccount: mail !== null, mail });
}

export async function assignAdvisor(className: string, lecturerId: string | null): Promise<ActionResult> {
  const viewer = await requirePermission("advisors.assign");
  if (lecturerId !== null && !isUuid(lecturerId)) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
  const [row] = await db
    .select({ id: administrativeClasses.id, faculty: faculties.name })
    .from(administrativeClasses)
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(administrativeClasses.code, className));
  if (!row) return actionError("Lớp sinh hoạt không còn tồn tại, tải lại trang.");
  if (!inScope(viewer, row.faculty)) return actionError("Lớp thuộc khoa khác, bạn không phân công được.");
  try {
    await db.update(administrativeClasses).set({ advisorId: lecturerId }).where(eq(administrativeClasses.id, row.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/advisors");
  revalidatePath("/lecturer", "layout");
  return actionOk();
}

export async function saveMyStudentContact(input: StudentContactInput): Promise<ActionResult> {
  const student = await getCurrentStudent();
  const parsed = parseInput(STUDENT_CONTACT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { emergencyName, emergencyPhone, ...values } = parsed.data;
  try {
    await db
      .update(students)
      .set({ ...values, emergencyContactName: emergencyName, emergencyContactPhone: emergencyPhone })
      .where(eq(students.id, student.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/application/profile");
  return actionOk();
}

export async function saveMyLecturerContact(input: LecturerContactInput): Promise<ActionResult> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(LECTURER_CONTACT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.update(lecturers).set(parsed.data).where(eq(lecturers.id, lecturer.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lecturer/profile");
  return actionOk();
}

// Trạng thái học tập sinh viên nhận khi quyết định được ký; thu hồi thì trở lại đang học.
const STATUS_AFTER_SIGN: Partial<Record<DecisionKind, StudentStatus>> = {
  reserve: "reserved",
  resume: "studying",
  suspend: "suspended",
  graduate: "graduated",
};

async function decisionOf(id: string) {
  return (await getDecisions()).find((decision) => decision.id === id) ?? null;
}

export async function createDecision(input: DecisionInput): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  const parsed = parseInput(DECISION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const student = await getStudent(parsed.data.studentId);
  if (!student || !inScope(viewer, student.faculty)) return actionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.", { studentId: "Sinh viên không hợp lệ" });
  let id: string;
  try {
    const [row] = await db.insert(studentDecisions).values(parsed.data).returning({ id: studentDecisions.id });
    id = row.id;
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/decisions");
  const decision = await decisionOf(id);
  return decision ? actionOk(decision) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

type DecisionStep = "submit" | "sign" | "revoke";

const FROM_STATUS: Record<DecisionStep, StudentDecision["status"]> = { submit: "draft", sign: "pending-signature", revoke: "signed" };

// Dự thảo → trình ký (cấp số) → ký (đổi trạng thái sinh viên) → thu hồi. Khóa dòng để hai người bấm cùng lúc không làm lệch số.
export async function advanceDecision(id: string, step: DecisionStep): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  if (!isUuid(id) || !(step in FROM_STATUS)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  try {
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id)).for("update");
      if (!row) return "Quyết định không còn tồn tại, tải lại trang.";
      if (row.status !== FROM_STATUS[step]) return "Quyết định đã được người khác xử lý, tải lại trang.";
      const student = await getStudent(row.studentId);
      if (!student || !inScope(viewer, student.faculty)) return "Sinh viên thuộc khoa khác.";
      if (step === "submit") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('student_decisions_number'))`);
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(split_part(${studentDecisions.number}, '/', 1)::int), 1300) + 1` })
          .from(studentDecisions)
          .where(sql`${studentDecisions.number} ~ '^[0-9]+/'`);
        await tx.update(studentDecisions).set({ status: "pending-signature", number: `${next}/QĐ-ĐHSP` }).where(eq(studentDecisions.id, id));
      } else if (step === "sign") {
        await tx.update(studentDecisions).set({ status: "signed", signedBy: `${viewer.name}, ${viewer.roleName}`, signedAt: new Date() }).where(eq(studentDecisions.id, id));
        const status = STATUS_AFTER_SIGN[row.kind];
        if (status) await tx.update(students).set({ status }).where(eq(students.id, row.studentId));
      } else {
        await tx.update(studentDecisions).set({ status: "revoked" }).where(eq(studentDecisions.id, id));
        if (STATUS_AFTER_SIGN[row.kind]) {
          await tx.update(students).set({ status: "studying" }).where(and(eq(students.id, row.studentId), eq(students.status, STATUS_AFTER_SIGN[row.kind]!)));
        }
      }
      return null;
    });
    if (outcome) return actionError(outcome);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  const decision = await decisionOf(id);
  return decision ? actionOk(decision) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}
