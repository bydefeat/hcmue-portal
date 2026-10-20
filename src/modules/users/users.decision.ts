import "server-only";
import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { schoolTime } from "@/shared/libs/date.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { DECISION_KIND_LABEL, DISCIPLINE_LEVEL_LABEL, STUDENT_STATUS } from "@/modules/users/users.constant";
import { changesProfile, decisionBlockedReason, decisionEffect, revokeBlockedReason, type DECISION_SCHEMA } from "@/modules/users/users.rule";
import { administrativeClasses, studentDecisions, students } from "@/modules/users/users.schema";
import type { z } from "zod";

// Người thao tác quyết định ở cổng quản trị (viewer), hoặc tác vụ nền (id null).
export type DecisionActor = { id: string | null; name: string; roleName: string; faculty: string | null };

export class DecisionError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type DecisionValues = z.output<typeof DECISION_SCHEMA>;
type DecisionRow = typeof studentDecisions.$inferSelect;

const SYSTEM_ACTOR: DecisionActor = { id: null, name: "Hệ thống", roleName: "Tác vụ định kỳ", faculty: null };

function auditActor(actor: DecisionActor): AuditActor {
  return { userId: actor.id, name: actor.name, role: actor.roleName };
}

export function today() {
  return schoolTime().format("YYYY-MM-DD");
}

// Sinh viên kèm lớp, khoa; khóa dòng để quyết định và thao tác khác trên cùng sinh viên không chen nhau.
async function lockStudent(tx: Transaction, studentId: string) {
  const [row] = await tx
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      status: students.status,
      administrativeClassId: students.administrativeClassId,
      majorId: administrativeClasses.majorId,
      cohort: administrativeClasses.cohort,
      faculty: faculties.name,
    })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(students.id, studentId))
    .for("update", { of: students });
  return row ?? null;
}

type LockedStudent = NonNullable<Awaited<ReturnType<typeof lockStudent>>>;

async function lockDecision(tx: Transaction, id: string) {
  const [row] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id)).for("update");
  if (!row) throw new DecisionError("Quyết định không còn tồn tại, tải lại trang.");
  return row;
}

function label(decision: Pick<DecisionRow, "number" | "kind">, student: Pick<LockedStudent, "code" | "fullName">) {
  return `${decision.number ?? "Dự thảo"} ${DECISION_KIND_LABEL[decision.kind]}, ${formatStudentCode(student.code)} ${student.fullName}`;
}

// Lớp sinh hoạt của ngành mới: phải có sẵn, khác ngành hiện tại, thuộc khoa trong phạm vi người lập.
async function targetClassOf(tx: Transaction, actor: DecisionActor, student: LockedStudent, className: string) {
  const [target] = await tx
    .select({ id: administrativeClasses.id, majorId: administrativeClasses.majorId, faculty: faculties.name })
    .from(administrativeClasses)
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(administrativeClasses.code, className));
  if (!target) throw new DecisionError(`Không có lớp sinh hoạt ${className}. Tạo lớp ở trang Sinh viên trước.`, "targetClassName");
  if (target.majorId === student.majorId) throw new DecisionError(`Lớp ${className} cùng ngành hiện tại của sinh viên, chọn lớp của ngành mới.`, "targetClassName");
  if (!inScope(actor, target.faculty)) throw new DecisionError("Lớp của ngành mới thuộc khoa ngoài phạm vi của bạn.", "targetClassName");
  return target.id;
}

// Quyết định đã ký nhưng chưa tới ngày hiệu lực, cùng làm đổi hồ sơ: ký chồng thì hai quyết định tranh nhau đổi tình trạng.
async function pendingEffectOf(tx: Transaction, studentId: string, exceptId: string) {
  const rows = await tx
    .select({ number: studentDecisions.number, kind: studentDecisions.kind, disciplineLevel: studentDecisions.disciplineLevel })
    .from(studentDecisions)
    .where(and(eq(studentDecisions.studentId, studentId), eq(studentDecisions.status, "signed"), isNull(studentDecisions.appliedAt), ne(studentDecisions.id, exceptId)));
  return rows.find((row) => changesProfile(row.kind, row.disciplineLevel)) ?? null;
}

function checkPrecondition(values: Pick<DecisionRow, "kind" | "disciplineLevel">, student: LockedStudent) {
  const blocked = decisionBlockedReason(values.kind, student.status, values.disciplineLevel);
  if (blocked) throw new DecisionError(blocked, "studentId");
}

// Lập dự thảo. Quyết định công nhận tốt nghiệp chỉ sinh ra ở trang Xét tốt nghiệp (gắn với hồ sơ đã được Hội đồng công nhận).
export async function createDecisionDraft(tx: Transaction, actor: DecisionActor, values: DecisionValues) {
  if (values.kind === "graduate") throw new DecisionError("Quyết định công nhận tốt nghiệp lập ở trang Xét tốt nghiệp, sau khi Hội đồng công nhận.", "kind");
  const student = await lockStudent(tx, values.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.", "studentId");
  checkPrecondition(values, student);
  const targetClassId = values.targetClassName ? await targetClassOf(tx, actor, student, values.targetClassName) : null;
  const [row] = await tx
    .insert(studentDecisions)
    .values({
      kind: values.kind,
      studentId: student.id,
      title: values.title,
      basis: values.basis,
      effectiveDate: values.effectiveDate,
      disciplineLevel: values.disciplineLevel,
      targetClassId,
      createdByUserId: actor.id,
    })
    .returning();
  await recordAudit(tx, {
    actor: auditActor(actor),
    action: "create",
    entityType: "decision",
    entityId: row.id,
    entityLabel: label(row, student),
    summary: `Lập dự thảo quyết định ${DECISION_KIND_LABEL[row.kind].toLowerCase()}: ${row.title}`,
  });
  return row.id;
}

// Sửa dự thảo (kể cả dự thảo bị trả lại). Sinh viên và loại quyết định giữ nguyên: lập mới nếu cần đổi.
export async function updateDecisionDraft(tx: Transaction, actor: DecisionActor, id: string, values: DecisionValues) {
  const row = await lockDecision(tx, id);
  if (row.status !== "draft") throw new DecisionError("Chỉ sửa được quyết định đang là dự thảo, tải lại trang.");
  if (row.studentId !== values.studentId || row.kind !== values.kind) throw new DecisionError("Không đổi sinh viên hay loại quyết định của dự thảo. Hủy dự thảo rồi lập mới.", "kind");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên không còn tồn tại hoặc thuộc khoa khác.");
  checkPrecondition(values, student);
  const targetClassId = values.targetClassName ? await targetClassOf(tx, actor, student, values.targetClassName) : null;
  const changes = [
    { field: "Nội dung", before: row.title, after: values.title },
    { field: "Căn cứ", before: row.basis, after: values.basis },
    { field: "Ngày hiệu lực", before: row.effectiveDate, after: values.effectiveDate },
    { field: "Hình thức kỷ luật", before: row.disciplineLevel ? DISCIPLINE_LEVEL_LABEL[row.disciplineLevel] : "", after: values.disciplineLevel ? DISCIPLINE_LEVEL_LABEL[values.disciplineLevel] : "" },
  ].filter((change) => change.before !== change.after);
  await tx
    .update(studentDecisions)
    .set({ title: values.title, basis: values.basis, effectiveDate: values.effectiveDate, disciplineLevel: values.disciplineLevel, targetClassId })
    .where(eq(studentDecisions.id, id));
  await recordAudit(tx, { actor: auditActor(actor), action: "update", entityType: "decision", entityId: id, entityLabel: label(row, student), summary: "Sửa dự thảo quyết định", changes });
}

// Hủy dự thảo: xóa hẳn (chưa có số, chưa có hiệu lực); nhật ký giữ lại dấu vết. Dự thảo tốt nghiệp hủy thì hồ sơ xét tốt nghiệp về chờ xét.
export async function deleteDecisionDraft(tx: Transaction, actor: DecisionActor, id: string) {
  const row = await lockDecision(tx, id);
  if (row.status !== "draft") throw new DecisionError("Chỉ hủy được quyết định đang là dự thảo. Quyết định đã ký thì thu hồi.");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên thuộc khoa khác.");
  if (row.kind === "graduate") await resetGraduationRecord(tx, row.studentId);
  await tx.delete(studentDecisions).where(eq(studentDecisions.id, id));
  await recordAudit(tx, { actor: auditActor(actor), action: "delete", entityType: "decision", entityId: id, entityLabel: label(row, student), summary: `Hủy dự thảo quyết định: ${row.title}` });
}

// Trình ký: cấp số kế tiếp (khóa tư vấn để hai người trình cùng lúc không trùng số).
export async function submitDecision(tx: Transaction, actor: DecisionActor, id: string) {
  const row = await lockDecision(tx, id);
  if (row.status !== "draft") throw new DecisionError("Quyết định đã được người khác xử lý, tải lại trang.");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên thuộc khoa khác.");
  checkPrecondition(row, student);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('student_decisions_number'))`);
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(split_part(${studentDecisions.number}, '/', 1)::int), 1300) + 1` })
    .from(studentDecisions)
    .where(sql`${studentDecisions.number} ~ '^[0-9]+/'`);
  const number = `${next}/QĐ-ĐHSP`;
  await tx.update(studentDecisions).set({ status: "pending-signature", number, returnReason: null }).where(eq(studentDecisions.id, id));
  await recordAudit(tx, { actor: auditActor(actor), action: "submit", entityType: "decision", entityId: id, entityLabel: label({ ...row, number }, student), summary: `Trình ký quyết định số ${number}` });
}

// Trả lại người lập để sửa: về dự thảo, bỏ số đã cấp, ghi lý do.
export async function returnDecision(tx: Transaction, actor: DecisionActor, id: string, reason: string) {
  const row = await lockDecision(tx, id);
  if (row.status !== "pending-signature") throw new DecisionError("Chỉ trả lại được quyết định đang chờ ký, tải lại trang.");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên thuộc khoa khác.");
  await tx.update(studentDecisions).set({ status: "draft", number: null, returnReason: reason }).where(eq(studentDecisions.id, id));
  await recordAudit(tx, {
    actor: auditActor(actor),
    action: "return",
    entityType: "decision",
    entityId: id,
    entityLabel: label(row, student),
    summary: `Trả lại quyết định ${row.number} cho người lập: ${reason}`,
  });
}

async function resetGraduationRecord(tx: Transaction, studentId: string) {
  await tx
    .update(graduationRecords)
    .set({ status: "pending", decidedAt: null, decidedByUserId: null, decisionId: null })
    .where(eq(graduationRecords.studentId, studentId));
}

// Đưa quyết định vào hồ sơ: lưu tình trạng, lớp trước đó để thu hồi trả về đúng chỗ.
async function applyEffect(tx: Transaction, actor: DecisionActor, row: DecisionRow, student: LockedStudent) {
  const { to } = decisionEffect(row.kind, row.disciplineLevel);
  await tx
    .update(studentDecisions)
    .set({ appliedAt: new Date(), previousStatus: student.status, previousClassId: student.administrativeClassId })
    .where(eq(studentDecisions.id, row.id));
  const changes: { field: string; before: string; after: string }[] = [];
  if (to && to !== student.status) {
    await tx.update(students).set({ status: to }).where(eq(students.id, student.id));
    changes.push({ field: "Tình trạng", before: STUDENT_STATUS[student.status].label, after: STUDENT_STATUS[to].label });
  }
  if (row.kind === "major-change" && row.targetClassId) {
    await tx.update(students).set({ administrativeClassId: row.targetClassId }).where(eq(students.id, student.id));
    changes.push({ field: "Lớp sinh hoạt", before: student.administrativeClassId, after: row.targetClassId });
  }
  if (row.kind === "graduate") {
    await tx.update(graduationRecords).set({ status: "graduated" }).where(eq(graduationRecords.studentId, student.id));
  }
  if (changes.length > 0) {
    await recordAudit(tx, {
      actor: auditActor(actor),
      action: "update",
      entityType: "student",
      entityId: student.id,
      entityLabel: `${formatStudentCode(student.code)} ${student.fullName}`,
      summary: `Áp dụng quyết định ${row.number}: ${DECISION_KIND_LABEL[row.kind].toLowerCase()}`,
      changes,
    });
  }
}

// Ký: người ký khác người lập (DB cũng chặn); kiểm lại điều kiện; có hiệu lực từ hôm nay trở về trước thì áp dụng ngay,
// ngày hiệu lực sau hôm nay thì tác vụ decision-effects áp dụng đúng ngày.
export async function signDecision(tx: Transaction, actor: DecisionActor, id: string) {
  const row = await lockDecision(tx, id);
  if (row.status !== "pending-signature") throw new DecisionError("Quyết định đã được người khác xử lý, tải lại trang.");
  if (actor.id !== null && row.createdByUserId === actor.id) throw new DecisionError("Bạn là người lập dự thảo nên không tự ký được. Nhờ người có quyền ký khác ký.");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên thuộc khoa khác.");
  checkPrecondition(row, student);
  if (changesProfile(row.kind, row.disciplineLevel)) {
    const pending = await pendingEffectOf(tx, row.studentId, id);
    if (pending) throw new DecisionError(`Sinh viên còn quyết định ${pending.number} (${DECISION_KIND_LABEL[pending.kind].toLowerCase()}) đã ký mà chưa tới ngày hiệu lực. Ký quyết định này sau ngày đó.`);
  }
  if (row.kind === "graduate") {
    const [record] = await tx.select({ status: graduationRecords.status }).from(graduationRecords).where(eq(graduationRecords.studentId, row.studentId)).for("update");
    if (record?.status !== "approved") throw new DecisionError("Hồ sơ xét tốt nghiệp của sinh viên chưa được Hội đồng công nhận, chưa ký được quyết định tốt nghiệp.");
  }
  const signedAt = new Date();
  await tx
    .update(studentDecisions)
    .set({ status: "signed", signedBy: `${actor.name}, ${actor.roleName}`, signedByUserId: actor.id, signedAt, returnReason: null })
    .where(eq(studentDecisions.id, id));
  const signed = { ...row, status: "signed" as const, signedAt };
  const effective = row.effectiveDate <= today();
  if (effective) await applyEffect(tx, actor, signed, student);
  await recordAudit(tx, {
    actor: auditActor(actor),
    action: "sign",
    entityType: "decision",
    entityId: id,
    entityLabel: label(row, student),
    summary: `Ký quyết định số ${row.number}${effective ? ", có hiệu lực ngay" : `, có hiệu lực từ ${schoolTime(row.effectiveDate).format("DD/MM/YYYY")}`}`,
  });
  await notifyStudents(tx, [row.studentId], {
    kind: "system",
    title: `Quyết định ${row.number}: ${DECISION_KIND_LABEL[row.kind]}`,
    body: `${row.title}. Có hiệu lực từ ${schoolTime(row.effectiveDate).format("DD/MM/YYYY")}.`,
    href: "/application/profile",
  });
  return { applied: effective };
}

// Thu hồi: trả sinh viên về đúng tình trạng, lớp trước khi quyết định có hiệu lực; tốt nghiệp thì hồ sơ xét tốt nghiệp về chờ xét lại.
export async function revokeDecision(tx: Transaction, actor: DecisionActor, id: string, reason: string) {
  const row = await lockDecision(tx, id);
  if (row.status !== "signed") throw new DecisionError("Chỉ thu hồi được quyết định đã ký, tải lại trang.");
  const student = await lockStudent(tx, row.studentId);
  if (!student || !inScope(actor, student.faculty)) throw new DecisionError("Sinh viên thuộc khoa khác.");
  const blocked = revokeBlockedReason(row, student);
  if (blocked) throw new DecisionError(blocked);
  const changes: { field: string; before: string; after: string }[] = [];
  if (row.appliedAt) {
    const { to } = decisionEffect(row.kind, row.disciplineLevel);
    if (to && row.previousStatus && row.previousStatus !== student.status) {
      await tx.update(students).set({ status: row.previousStatus }).where(eq(students.id, student.id));
      changes.push({ field: "Tình trạng", before: STUDENT_STATUS[student.status].label, after: STUDENT_STATUS[row.previousStatus].label });
    }
    if (row.kind === "major-change" && row.previousClassId) {
      await tx.update(students).set({ administrativeClassId: row.previousClassId }).where(eq(students.id, student.id));
      changes.push({ field: "Lớp sinh hoạt", before: student.administrativeClassId, after: row.previousClassId });
    }
  }
  if (row.kind === "graduate") await resetGraduationRecord(tx, row.studentId);
  await tx
    .update(studentDecisions)
    .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: actor.id, revokedBy: `${actor.name}, ${actor.roleName}`, revokeReason: reason })
    .where(eq(studentDecisions.id, id));
  await recordAudit(tx, {
    actor: auditActor(actor),
    action: "revoke",
    entityType: "decision",
    entityId: id,
    entityLabel: label(row, student),
    summary: `Thu hồi quyết định số ${row.number}: ${reason}`,
    changes,
  });
}

// Tác vụ decision-effects (mỗi ngày): áp dụng quyết định đã ký tới ngày hiệu lực. Mỗi quyết định một transaction;
// điều kiện không còn đúng (tình trạng đã đổi) thì để nguyên, người ký xem và thu hồi. Chạy lại không áp dụng hai lần (appliedAt).
export async function runDecisionEffectsJob(): Promise<Record<string, number>> {
  const due = await db
    .select({ id: studentDecisions.id })
    .from(studentDecisions)
    .where(and(eq(studentDecisions.status, "signed"), isNull(studentDecisions.appliedAt), lte(studentDecisions.effectiveDate, today())));
  let applied = 0;
  let skipped = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      const row = await lockDecision(tx, id);
      if (row.status !== "signed" || row.appliedAt) return false;
      const student = await lockStudent(tx, row.studentId);
      if (!student || decisionBlockedReason(row.kind, student.status, row.disciplineLevel)) return false;
      await applyEffect(tx, SYSTEM_ACTOR, row, student);
      return true;
    });
    if (done) applied += 1;
    else skipped += 1;
  }
  return { due: due.length, applied, skipped };
}

// Ids sinh viên có quyết định đổi hồ sơ đang dở (đã ký chưa áp dụng): dùng cho trang để báo trước.
export async function studentsWithPendingEffects(studentIds: string[]) {
  if (studentIds.length === 0) return new Set<string>();
  const rows = await db
    .select({ studentId: studentDecisions.studentId })
    .from(studentDecisions)
    .where(and(inArray(studentDecisions.studentId, studentIds), eq(studentDecisions.status, "signed"), isNull(studentDecisions.appliedAt)));
  return new Set(rows.map((row) => row.studentId));
}
