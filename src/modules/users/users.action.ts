"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { PDF_MIME } from "@/shared/libs/pdf.lib";
import { bytesToBase64 } from "@/shared/libs/spreadsheet.lib";
import { formatStudentCode, studentEmailOf } from "@/shared/libs/student-code.lib";
import { user as users } from "@/modules/authentication/authentication.schema";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import { grantBlockedReason, isSystemAdmin, lockBlockedReason } from "@/modules/access/access.rule";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import type { AuditChange } from "@/modules/audit/audit.type";
import { deliverMailSoon } from "@/modules/mail/mail.lib";
import { notifyLecturers } from "@/modules/notifications/notifications.lib";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { ACCOUNT_STATUS, GENDER_LABEL, LECTURER_STATUS, NO_ACCOUNT, STUDENT_STATUS, USERS_CONSTRAINT_MESSAGE } from "@/modules/users/users.constant";
import { decisionPdf } from "@/modules/users/users.pdf";
import { getCurrentLecturer, getCurrentStudent, getDecision, getLecturer, getStaffMember, getStudent } from "@/modules/users/users.query";
import {
  createAccounts,
  lockAccountProfiles,
  randomPasswordHashes,
  readAccountStates,
  readHeldRoles,
  queueActivationMails,
  setAccountsLocked,
  staffProfile,
  syncAccountProfile,
  type AccountProfile,
  type NewAccount,
} from "@/modules/users/users.account";
import {
  createDecisionDraft,
  DecisionError,
  deleteDecisionDraft,
  returnDecision as returnDecisionStep,
  revokeDecision as revokeDecisionStep,
  signDecision as signDecisionStep,
  submitDecision as submitDecisionStep,
  updateDecisionDraft,
  type DecisionActor,
} from "@/modules/users/users.decision";
import {
  ACCOUNT_BATCH_SCHEMA,
  DECISION_REASON_SCHEMA,
  DECISION_SCHEMA,
  LECTURER_CONTACT_SCHEMA,
  LECTURER_SCHEMA,
  STAFF_SCHEMA,
  STAFF_UPDATE_SCHEMA,
  STATUS_OVERRIDE_SCHEMA,
  STUDENT_CONTACT_SCHEMA,
  STUDENT_SCHEMA,
  type AccountBatchInput,
  type DecisionInput,
  type LecturerContactInput,
  type LecturerInput,
  type StaffInput,
  type StaffUpdateInput,
  type StatusOverrideInput,
  type StudentContactInput,
  type StudentInput,
} from "@/modules/users/users.rule";
import { administrativeClasses, lecturers, staffMembers, students } from "@/modules/users/users.schema";
import type { AccountBatchResult, AccountKind, AccountState, Lecturer, MailOutcome, SavedProfile, StaffMember, Student, StudentDecision } from "@/modules/users/users.type";

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
  if (error instanceof DecisionError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, USERS_CONSTRAINT_MESSAGE);
}

function diff(fields: [label: string, before: string, after: string][]): AuditChange[] {
  return fields.filter(([, before, after]) => before !== after).map(([field, before, after]) => ({ field, before, after }));
}

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
    email: studentEmailOf(values.code),
    personalEmail: values.personalEmail,
    phone: values.phone,
    administrativeClassId: classId,
  };
}

const ENTITY_OF = { student: "student", lecturer: "lecturer", staff: "staff" } as const;
const KIND_OF_ROLE = { student: "student", lecturer: "lecturer", admin: "staff" } as const;

async function recordCreatedAccounts(tx: Transaction, actor: AuditActor, created: NewAccount[]) {
  for (const entry of created) {
    await recordAudit(tx, {
      actor,
      action: "create",
      entityType: ENTITY_OF[KIND_OF_ROLE[entry.role]],
      entityId: entry.id,
      entityLabel: `${entry.loginName} ${entry.name}`,
      summary: `Cấp tài khoản đăng nhập ${entry.loginName}, gửi thư kích hoạt tới ${entry.email}`,
    });
  }
  return queueActivationMails(tx, created);
}

function sendQueuedMails(mailIds: string[]): MailOutcome | null {
  deliverMailSoon(mailIds);
  return mailIds.length > 0 ? { queued: mailIds.length } : null;
}

async function studentSnapshot(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ fullName: students.fullName, gender: students.gender, dateOfBirth: students.dateOfBirth, personalEmail: students.personalEmail, phone: students.phone, className: administrativeClasses.code })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(eq(students.id, id));
  return row ?? null;
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
      const [current] = id ? await lockAccountProfiles(tx, "student", [id]) : [];
      if (id && !current) throw new InputError("code", "Sinh viên không còn tồn tại, tải lại trang.");
      if (current && !inScope(viewer, current.faculty)) throw new InputError("majorCode", "Sinh viên thuộc khoa khác, bạn không sửa được hồ sơ này");
      const before = id ? await studentSnapshot(tx, id) : null;
      const { classId, faculty } = await classIdFor(tx, values.className, values.majorCode, values.cohort);
      if (!inScope(viewer, faculty)) throw new InputError("majorCode", "Ngành thuộc khoa khác, bạn không quản lý hồ sơ này");
      const columns = studentColumns(values, classId);
      const [row] = id
        ? await tx
            .update(students)
            .set({ ...columns, email: studentEmailOf(current!.username ?? values.code) })
            .where(eq(students.id, id))
            .returning({ id: students.id, userId: students.userId, code: students.code })
        : await tx
            .insert(students)
            .values({ ...columns, code: values.code })
            .returning({ id: students.id, userId: students.userId, code: students.code });
      await syncAccountProfile(tx, row.userId, { name: values.fullName });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: id ? "update" : "create",
        entityType: "student",
        entityId: row.id,
        entityLabel: `${formatStudentCode(row.code)} ${values.fullName}`,
        summary: id ? "Sửa hồ sơ sinh viên" : `Thêm hồ sơ sinh viên vào lớp ${values.className}`,
        changes: before
          ? diff([
              ["Họ và tên", before.fullName, values.fullName],
              ["Giới tính", GENDER_LABEL[before.gender], GENDER_LABEL[values.gender]],
              ["Ngày sinh", before.dateOfBirth, values.dateOfBirth],
              ["Lớp sinh hoạt", before.className, values.className],
              ["Email cá nhân", before.personalEmail, values.personalEmail],
              ["Điện thoại", before.phone, values.phone],
            ])
          : [],
      });
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
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "create",
          entityType: "student",
          entityId: row.id,
          entityLabel: `${formatStudentCode(values.code)} ${values.fullName}`,
          summary: `Nhập hồ sơ sinh viên từ tệp (${rows.length} dòng) vào lớp ${values.className}`,
        });
      }
      if (!options.provisionAccounts) return { ids: inserted, created: [], mailIds: [] };
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

export async function overrideStudentsStatus(input: StatusOverrideInput): Promise<ActionResult<{ updated: number }>> {
  const viewer = await requirePermission("students.manage");
  if (!isSystemAdmin(viewer)) return actionError("Tình trạng học tập đổi qua quyết định sinh viên. Chỉ quản trị hệ thống sửa tay được để chữa dữ liệu sai.");
  const parsed = parseInput(STATUS_OVERRIDE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { ids, status, reason } = parsed.data;
  try {
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: students.id, code: students.code, fullName: students.fullName, status: students.status, faculty: faculties.name })
        .from(students)
        .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .innerJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(inArray(students.id, ids))
        .for("update", { of: students });
      if (rows.some((row) => !inScope(viewer, row.faculty))) throw new InputError("ids", "Có sinh viên thuộc khoa khác, bạn không đổi tình trạng được.");
      const changed = rows.filter((row) => row.status !== status);
      if (changed.length === 0) return 0;
      await tx
        .update(students)
        .set({ status })
        .where(inArray(students.id, changed.map((row) => row.id)));
      for (const row of changed) {
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "update",
          entityType: "student",
          entityId: row.id,
          entityLabel: `${formatStudentCode(row.code)} ${row.fullName}`,
          summary: `Sửa tay tình trạng học tập (không qua quyết định): ${reason}`,
          changes: [{ field: "Tình trạng", before: STUDENT_STATUS[row.status].label, after: STUDENT_STATUS[status].label }],
        });
      }
      return changed.length;
    });
    revalidatePath("/administrator/users/students", "layout");
    return actionOk({ updated });
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
      const [before] = id ? await tx.select().from(lecturers).where(eq(lecturers.id, id)) : [];
      const [row] = id
        ? await tx
            .update(lecturers)
            .set({ ...values, facultyId: facultyRow.id })
            .where(eq(lecturers.id, id))
            .returning({ id: lecturers.id, userId: lecturers.userId, code: lecturers.code })
        : await tx
            .insert(lecturers)
            .values({ ...values, code, facultyId: facultyRow.id })
            .returning({ id: lecturers.id, userId: lecturers.userId, code: lecturers.code });
      if (!row) return null;
      await syncAccountProfile(tx, row.userId, { name: `${values.title} ${values.fullName}`, email: values.email });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: id ? "update" : "create",
        entityType: "lecturer",
        entityId: row.id,
        entityLabel: `${row.code} ${values.title} ${values.fullName}`,
        summary: id ? "Sửa hồ sơ giảng viên" : `Thêm giảng viên ${faculty}`,
        changes: before
          ? diff([
              ["Họ và tên", before.fullName, values.fullName],
              ["Học hàm, học vị", before.title, values.title],
              ["Khoa", current?.faculty ?? "", faculty],
              ["Email công vụ", before.email, values.email],
              ["Điện thoại", before.phone, values.phone],
              ["Tình trạng", LECTURER_STATUS[before.status].label, LECTURER_STATUS[values.status].label],
            ])
          : [],
      });
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

const PAGE_OF = { student: "/administrator/users/students", lecturer: "/administrator/users/lecturers", staff: "/administrator/users/staff" } as const;
const OUT_OF_SCOPE = "Có hồ sơ thuộc khoa khác, bạn không quản lý tài khoản của hồ sơ đó. Bỏ chọn rồi thử lại.";

type Skipped = { profile: AccountProfile; reason: string };

async function requireAccountManager(input: { kind?: unknown } | null | undefined): Promise<Viewer> {
  if (input?.kind === "staff") return requireSchoolWidePermission("access.manage");
  return requirePermission(input?.kind === "lecturer" ? "lecturers.manage" : "students.manage");
}

function outOfScope(viewer: Viewer, kind: AccountKind, profiles: AccountProfile[]) {
  return kind !== "staff" && profiles.some((profile) => !inScope(viewer, profile.faculty));
}

async function batchResult(kind: AccountKind, ids: string[], changed: number, mail: MailOutcome | null, skipped: Skipped[]) {
  return actionOk<AccountBatchResult>({
    accounts: await readAccountStates(db, kind, ids),
    changed,
    mailed: mail?.queued ?? 0,
    skipped: skipped.map(({ profile, reason }) => ({ id: profile.id, name: profile.name, reason })),
  });
}

export async function provisionAccounts(input: AccountBatchInput): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requireAccountManager(input);
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
      if (outOfScope(viewer, kind, profiles)) return null;
      const result = await createAccounts(tx, profiles, hashes);
      if (kind === "staff") await clearRoleWithoutAssignment(tx, result.created);
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

async function clearRoleWithoutAssignment(tx: Transaction, created: NewAccount[]) {
  if (created.length === 0) return;
  await tx
    .update(users)
    .set({ role: null })
    .where(inArray(users.id, created.map((entry) => entry.userId)));
}

export async function resendActivation(input: AccountBatchInput): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requireAccountManager(input);
  const parsed = parseInput(ACCOUNT_BATCH_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { kind, ids } = parsed.data;
  let targets: AccountProfile[];
  let skipped: Skipped[];
  let mailIds: string[];
  try {
    const outcome = await db.transaction(async (tx) => {
      const profiles = await lockAccountProfiles(tx, kind, ids);
      if (outOfScope(viewer, kind, profiles)) return null;
      const states = await readAccountStates(tx, kind, ids);
      const statusOf = (profile: AccountProfile) => states[profile.id]?.status ?? "none";
      const pending = profiles.filter((profile) => statusOf(profile) === "pending");
      for (const profile of pending) {
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "update",
          entityType: ENTITY_OF[kind],
          entityId: profile.id,
          entityLabel: `${profile.loginName} ${profile.name}`,
          summary: `Gửi lại thư kích hoạt tới ${profile.email}`,
        });
      }
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

export async function setAccountLock(input: AccountBatchInput & { locked: boolean }): Promise<ActionResult<AccountBatchResult>> {
  const viewer = await requireAccountManager(input);
  const parsed = parseInput(ACCOUNT_BATCH_SCHEMA.extend({ locked: z.boolean() }), input);
  if (!parsed.ok) return parsed;
  const { kind, ids, locked } = parsed.data;
  let changed: AccountProfile[];
  let skipped: Skipped[];
  try {
    const outcome = await db.transaction(async (tx) => {
      const profiles = await lockAccountProfiles(tx, kind, ids);
      if (outOfScope(viewer, kind, profiles)) throw new InputError("ids", OUT_OF_SCOPE);
      if (locked && profiles.some((profile) => profile.userId === viewer.id)) throw new InputError("ids", "Không khóa được tài khoản của chính bạn. Bỏ chọn hồ sơ của mình rồi thử lại.");
      const held = await readHeldRoles(tx, profiles.flatMap((profile) => (profile.userId ? [profile.userId] : [])));
      for (const profile of profiles) {
        const blocked = profile.userId ? lockBlockedReason(viewer, held.get(profile.userId) ?? []) : null;
        if (blocked) throw new InputError("ids", `${profile.name}: ${blocked}`);
      }
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

export async function createStaffMember(input: StaffInput): Promise<ActionResult<{ id: string; name: string; hasAccount: boolean; roleName: string | null; mail: MailOutcome | null }>> {
  const viewer = await requireSchoolWidePermission("access.manage");
  const parsed = parseInput(STAFF_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { provisionAccount, roleId, faculty, ...values } = parsed.data;
  if (roleId && !provisionAccount) return actionError("Cấp vai trò cần cấp tài khoản đăng nhập. Chọn cấp tài khoản hoặc bỏ vai trò.", { roleId: "Cần cấp tài khoản" });
  const hashes = provisionAccount ? await randomPasswordHashes(1) : [];
  let staffId: string;
  let roleName: string | null = null;
  let mailIds: string[] = [];
  try {
    ({ staffId, roleName, mailIds } = await db.transaction(async (tx) => {
      const [row] = await tx.insert(staffMembers).values(values).returning({ id: staffMembers.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "create",
        entityType: "staff",
        entityId: row.id,
        entityLabel: `${values.code} ${values.fullName}`,
        summary: `Thêm cán bộ ${values.fullName}, ${values.unit}`,
      });
      if (!provisionAccount) return { staffId: row.id, roleName: null, mailIds: [] };
      const profile = staffProfile({ id: row.id, userId: null, code: values.code, name: values.fullName, faculty: values.unit, email: values.email }, "admin");
      const result = await createAccounts(tx, [profile], hashes);
      if (result.skipped.length > 0) throw new InputError(result.skipped[0].field, result.skipped[0].reason);
      const [account] = result.created;
      let granted: string | null = null;
      if (roleId) granted = await grantInitialRole(tx, viewer, account.userId, roleId, faculty ?? null, values);
      else await clearRoleWithoutAssignment(tx, result.created);
      return { staffId: row.id, roleName: granted, mailIds: await recordCreatedAccounts(tx, auditActorOf(viewer), result.created) };
    }));
  } catch (error) {
    return failure(error);
  }
  const mail = sendQueuedMails(mailIds);
  revalidatePath("/administrator/settings/access");
  revalidatePath("/administrator/users/staff");
  return actionOk({ id: staffId, name: values.fullName, hasAccount: provisionAccount, roleName, mail });
}

async function grantInitialRole(tx: Transaction, viewer: Viewer, userId: string, roleId: string, faculty: string | null, staff: { code: string; fullName: string; unit: string }) {
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId));
  if (!role) throw new InputError("roleId", "Vai trò không còn tồn tại, tải lại trang.");
  const permissions = (await tx.select({ permission: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId))).map((entry) => entry.permission);
  const scopedFaculty = role.scope === "faculty" ? faculty : null;
  const blocked = grantBlockedReason(viewer, { ...role, permissions }, { userId, faculty: scopedFaculty, targetFaculty: staff.unit });
  if (blocked) throw new InputError("roleId", blocked);
  let facultyId: string | null = null;
  if (role.scope === "faculty") {
    const [row] = scopedFaculty ? await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, scopedFaculty)) : [];
    if (!row) throw new InputError("faculty", "Vai trò theo khoa cần chọn khoa");
    facultyId = row.id;
  }
  const [assignment] = await tx.insert(roleAssignments).values({ userId, roleId, facultyId, grantedByUserId: viewer.id }).returning({ id: roleAssignments.id });
  await tx.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  const roleLabel = scopedFaculty ? `${role.name}, ${scopedFaculty}` : role.name;
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "permission",
    entityType: "role",
    entityId: assignment.id,
    entityLabel: `${staff.code} ${staff.fullName}`,
    summary: `Cấp vai trò ${roleLabel} cho ${staff.fullName} khi tạo cán bộ`,
    changes: [{ field: "Vai trò", before: "", after: roleLabel }],
  });
  return roleLabel;
}

export async function updateStaffMember(id: string, input: StaffUpdateInput): Promise<ActionResult<StaffMember>> {
  const viewer = await requireSchoolWidePermission("access.manage");
  if (!isUuid(id)) return actionError("Cán bộ không còn tồn tại, tải lại trang.");
  const parsed = parseInput(STAFF_UPDATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(staffMembers).where(eq(staffMembers.id, id)).for("update");
      if (!before) throw new InputError("fullName", "Cán bộ không còn tồn tại, tải lại trang.");
      await tx.update(staffMembers).set(values).where(eq(staffMembers.id, id));
      await syncAccountProfile(tx, before.userId, { name: values.fullName, email: values.email });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "staff",
        entityId: id,
        entityLabel: `${before.code} ${values.fullName}`,
        summary: "Sửa thông tin cán bộ",
        changes: diff([
          ["Họ và tên", before.fullName, values.fullName],
          ["Đơn vị", before.unit, values.unit],
          ["Email công vụ", before.email, values.email],
        ]),
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/users/staff");
  revalidatePath("/administrator/settings/access");
  const staff = await getStaffMember(id);
  return staff ? actionOk(staff) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function assignAdvisor(className: string, lecturerId: string | null): Promise<ActionResult> {
  const viewer = await requirePermission("advisors.assign");
  if (lecturerId !== null && !isUuid(lecturerId)) return actionError("Giảng viên không còn tồn tại, tải lại trang.");
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: administrativeClasses.id, advisorId: administrativeClasses.advisorId, facultyId: faculties.id, faculty: faculties.name })
        .from(administrativeClasses)
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .innerJoin(faculties, eq(faculties.id, majors.facultyId))
        .where(eq(administrativeClasses.code, className))
        .for("update", { of: administrativeClasses });
      if (!row) throw new InputError("className", "Lớp sinh hoạt không còn tồn tại, tải lại trang.");
      if (!inScope(viewer, row.faculty)) throw new InputError("className", "Lớp thuộc khoa khác, bạn không phân công được.");
      if (row.advisorId === lecturerId) return;
      const ids = [lecturerId, row.advisorId].filter((value): value is string => value !== null);
      const people = ids.length > 0 ? await tx.select().from(lecturers).where(inArray(lecturers.id, ids)) : [];
      const next = people.find((person) => person.id === lecturerId);
      const previous = people.find((person) => person.id === row.advisorId);
      if (lecturerId !== null) {
        if (!next) throw new InputError("lecturerId", "Giảng viên không còn tồn tại, tải lại trang.");
        if (next.facultyId !== row.facultyId) throw new InputError("lecturerId", `Chỉ phân công giảng viên thuộc ${row.faculty} làm cố vấn lớp này.`);
        if (next.status !== "active") throw new InputError("lecturerId", `${next.title} ${next.fullName} đang nghỉ phép, chọn giảng viên khác.`);
      }
      await tx.update(administrativeClasses).set({ advisorId: lecturerId }).where(eq(administrativeClasses.id, row.id));
      const nameOf = (person: typeof next) => (person ? `${person.title} ${person.fullName}` : "Chưa phân công");
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "assign",
        entityType: "lecturer",
        entityId: next?.id ?? previous?.id ?? row.id,
        entityLabel: `Lớp ${className}`,
        summary: lecturerId ? `Phân công ${nameOf(next)} làm cố vấn lớp ${className}` : `Bỏ phân công cố vấn lớp ${className}`,
        changes: [{ field: "Cố vấn", before: nameOf(previous), after: nameOf(next) }],
      });
      if (next) {
        await notifyLecturers(tx, [next.id], {
          kind: "advising",
          title: `Bạn được phân công cố vấn lớp ${className}`,
          body: `Phòng Đào tạo phân công bạn làm cố vấn học tập lớp sinh hoạt ${className}.`,
          href: "/lecturer/advising/students",
        });
      }
      if (previous) {
        await notifyLecturers(tx, [previous.id], {
          kind: "advising",
          title: `Thôi cố vấn lớp ${className}`,
          body: `Lớp sinh hoạt ${className} đã được chuyển cho ${lecturerId ? nameOf(next) : "cố vấn khác"}.`,
          href: "/lecturer/advising/students",
        });
      }
    });
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

function actorOf(viewer: Viewer): DecisionActor {
  return { id: viewer.id, name: viewer.name, roleName: viewer.roleName, faculty: viewer.faculty };
}

async function decisionResult(id: string) {
  revalidatePath("/administrator", "layout");
  const decision = await getDecision(id);
  return decision ? actionOk(decision) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function createDecision(input: DecisionInput): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  const parsed = parseInput(DECISION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let id: string;
  try {
    id = await db.transaction((tx) => createDecisionDraft(tx, actorOf(viewer), parsed.data));
  } catch (error) {
    return failure(error);
  }
  return decisionResult(id);
}

export async function updateDecision(id: string, input: DecisionInput): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  if (!isUuid(id)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  const parsed = parseInput(DECISION_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => updateDecisionDraft(tx, actorOf(viewer), id, parsed.data));
  } catch (error) {
    return failure(error);
  }
  return decisionResult(id);
}

export async function deleteDecision(id: string): Promise<ActionResult> {
  const viewer = await requirePermission("decisions.manage");
  if (!isUuid(id)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  try {
    await db.transaction((tx) => deleteDecisionDraft(tx, actorOf(viewer), id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator", "layout");
  return actionOk();
}

export async function submitDecision(id: string): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.manage");
  if (!isUuid(id)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  try {
    await db.transaction((tx) => submitDecisionStep(tx, actorOf(viewer), id));
  } catch (error) {
    return failure(error);
  }
  return decisionResult(id);
}

export async function signDecision(id: string): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.sign");
  if (!isUuid(id)) return actionError("Quyết định không còn tồn tại, tải lại trang.");
  try {
    await db.transaction((tx) => signDecisionStep(tx, actorOf(viewer), id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/graduation");
  return decisionResult(id);
}

export async function returnDecision(id: string, reason: string): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.sign");
  const parsed = parseInput(DECISION_REASON_SCHEMA, { id, reason });
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => returnDecisionStep(tx, actorOf(viewer), parsed.data.id, parsed.data.reason));
  } catch (error) {
    return failure(error);
  }
  return decisionResult(id);
}

export async function revokeDecision(id: string, reason: string): Promise<ActionResult<StudentDecision>> {
  const viewer = await requirePermission("decisions.sign");
  const parsed = parseInput(DECISION_REASON_SCHEMA, { id, reason });
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => revokeDecisionStep(tx, actorOf(viewer), parsed.data.id, parsed.data.reason));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/graduation");
  return decisionResult(id);
}

export async function downloadDecisionPdf(id: string): Promise<ActionResult<{ fileName: string; base64: string; mimeType: string }>> {
  const viewer = await getViewer();
  if (!can(viewer, "decisions.manage") && !can(viewer, "decisions.sign")) forbidden();
  const decision = await getDecision(id);
  if (!decision || !inScope(viewer, decision.faculty)) return actionError("Quyết định không còn tồn tại hoặc thuộc khoa khác, tải lại trang.");
  const bytes = await decisionPdf(decision);
  const name = decision.number ? decision.number.split("/")[0] : "du-thao";
  return actionOk({ fileName: `quyet-dinh-${name}-${decision.studentCode.replace(/\./g, "")}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME });
}
