import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { schoolTime, schoolToday } from "@/shared/libs/date.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { notifyLecturers, notifyStudents, notifyUsers } from "@/modules/notifications/notifications.lib";
import { regulationAt } from "@/modules/settings/settings.lib";
import { GRADE_AMENDMENT_SOURCE } from "@/modules/grades/grades.constant";
import { GradeActionError } from "@/modules/grades/grades.lib";
import { courseGrade, overdueIncompletes, resultText, weightedScore } from "@/modules/grades/grades.rule";
import { courseResults, gradeAmendments, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { GradeAmendmentSource } from "@/modules/grades/grades.type";
import { students } from "@/modules/users/users.schema";

type Executor = Transaction | typeof db;

const AMENDABLE = ["locked", "approved", "published"] as const;

// Bảng điểm của lớp, khóa dòng để đề nghị, duyệt sửa điểm không chen với công bố.
async function lockSheetOf(tx: Transaction, where: { classSectionId: string } | { gradeSheetId: string }) {
  const [sheet] = await tx
    .select({
      id: gradeSheets.id,
      status: gradeSheets.status,
      publishedAt: gradeSheets.publishedAt,
      classSectionId: gradeSheets.classSectionId,
      classCode: classSections.code,
      lecturerId: classSections.lecturerId,
      courseName: courses.name,
      facultyId: courses.facultyId,
      faculty: faculties.name,
    })
    .from(gradeSheets)
    .innerJoin(classSections, eq(classSections.id, gradeSheets.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where("classSectionId" in where ? eq(gradeSheets.classSectionId, where.classSectionId) : eq(gradeSheets.id, where.gradeSheetId))
    .for("update", { of: gradeSheets });
  return sheet ?? null;
}

// Tài khoản cán bộ có quyền công bố điểm trong phạm vi khoa của học phần: nhận thông báo có đề nghị sửa điểm cần duyệt.
export async function gradePublisherUserIds(executor: Executor, facultyId: string) {
  const rows = await executor
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.permission, "grades.publish")))
    .innerJoin(user, eq(user.id, roleAssignments.userId))
    .where(and(or(eq(roles.scope, "university"), eq(roleAssignments.facultyId, facultyId)), sql`',' || ${user.role} || ',' LIKE '%,admin,%'`));
  return rows.map((row) => row.userId);
}

export type AmendmentRequester = { userId: string | null; name: string; role: string };

export type ProposeAmendmentInput = {
  classSectionId: string;
  studentId: string;
  componentKey?: string;
  componentLabel?: string;
  newScore: number;
  reason: string;
  source: GradeAmendmentSource;
  requestId?: string | null;
  requester: AmendmentRequester;
  // Chỉ nhận bảng điểm đã công bố (giảng viên đề nghị từ bảng điểm); đơn sửa điểm nhận cả bảng điểm đã chốt, đã duyệt.
  publishedOnly?: boolean;
  notify?: boolean;
};

// Đề nghị sửa một cột điểm của một sinh viên: kiểm bảng điểm đã chốt, cột thuộc bảng điểm, sinh viên đang học lớp, điểm mới khác
// điểm đang lưu. DB chặn lần cuối (grade_amendments_guard, một đề nghị chờ duyệt cho mỗi ô).
export async function proposeGradeAmendment(tx: Transaction, input: ProposeAmendmentInput) {
  const sheet = await lockSheetOf(tx, { classSectionId: input.classSectionId });
  if (!sheet || !(AMENDABLE as readonly string[]).includes(sheet.status)) throw new GradeActionError("Bảng điểm của lớp chưa chốt, giảng viên sửa trực tiếp trên trang nhập điểm.");
  if (input.publishedOnly && sheet.status !== "published") throw new GradeActionError("Bảng điểm chưa công bố. Điểm đã chốt chờ duyệt thì gửi đơn sửa điểm hoặc nhờ khoa trả lại.");
  const [component] = await tx
    .select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label })
    .from(gradeComponents)
    .where(and(eq(gradeComponents.gradeSheetId, sheet.id), input.componentKey ? eq(gradeComponents.key, input.componentKey) : eq(gradeComponents.label, input.componentLabel ?? "")));
  if (!component) throw new GradeActionError("Bảng điểm không có cột điểm này, tải lại trang.");
  const [enrollment] = await tx
    .select({ id: enrollments.id, fullName: students.fullName, code: students.code, userId: students.userId })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, sheet.classSectionId), eq(enrollments.studentId, input.studentId), eq(enrollments.status, "enrolled")));
  if (!enrollment) throw new GradeActionError("Sinh viên không còn trong danh sách lớp.");
  const [current] = await tx
    .select({ score: gradeScores.score })
    .from(gradeScores)
    .where(and(eq(gradeScores.gradeComponentId, component.id), eq(gradeScores.enrollmentId, enrollment.id)));
  const oldScore = current?.score ?? null;
  if (oldScore === input.newScore) throw new GradeActionError("Điểm mới trùng điểm hiện tại.");
  const [pending] = await tx
    .select({ id: gradeAmendments.id })
    .from(gradeAmendments)
    .where(and(eq(gradeAmendments.enrollmentId, enrollment.id), eq(gradeAmendments.gradeComponentId, component.id), eq(gradeAmendments.status, "pending")));
  if (pending) throw new GradeActionError(`Cột ${component.label} của sinh viên này đang có đề nghị sửa điểm chờ duyệt.`);
  const [row] = await tx
    .insert(gradeAmendments)
    .values({
      gradeSheetId: sheet.id,
      gradeComponentId: component.id,
      enrollmentId: enrollment.id,
      studentId: input.studentId,
      componentLabel: component.label,
      oldScore,
      newScore: input.newScore,
      reason: input.reason,
      source: input.source,
      requestId: input.requestId ?? null,
      requestedByUserId: input.requester.userId,
      requestedByName: input.requester.name,
    })
    .returning({ id: gradeAmendments.id });
  const studentLabel = `${enrollment.fullName} (${formatStudentCode(enrollment.code)})`;
  await recordAudit(tx, {
    actor: input.requester,
    action: "submit",
    entityType: "grade-sheet",
    entityId: sheet.id,
    entityLabel: `${sheet.classCode} ${sheet.courseName}`,
    summary: `Đề nghị sửa điểm ${component.label} của ${studentLabel} (${GRADE_AMENDMENT_SOURCE[input.source].toLowerCase()}). Lý do: ${input.reason}`,
    changes: [{ field: `${component.label} của ${studentLabel}`, before: scoreLabel(oldScore), after: scoreLabel(input.newScore) }],
  });
  if (input.notify !== false) {
    const publishers = (await gradePublisherUserIds(tx, sheet.facultyId)).filter((id) => id !== input.requester.userId);
    await notifyUsers(tx, publishers, "administrator", {
      kind: "grade",
      title: `Đề nghị sửa điểm lớp ${sheet.classCode} chờ duyệt`,
      body: `${input.requester.name} đề nghị sửa ${component.label} của ${studentLabel}: ${scoreLabel(oldScore)} thành ${scoreLabel(input.newScore)}.`,
      href: "/administrator/grade-amendments",
    });
  }
  return { id: row.id, gradeSheetId: sheet.id };
}

function scoreLabel(score: number | null) {
  return score === null ? "chưa có" : score.toFixed(2).replace(".", ",");
}

const requesterUser = alias(user, "requester_user");

export type DecideAmendmentInput = { id: string; decision: "approved" | "rejected"; note: string; actor: AuditActor };

// Duyệt (áp điểm, tính lại kết quả học phần) hoặc từ chối một đề nghị sửa điểm. Người đề nghị không tự duyệt (DB chặn thêm bằng
// grade_amendments_not_self_approved). Điểm chữ, thang 4 quy đổi theo bản quy chế áp dụng ngày công bố bảng điểm, như lúc công bố.
export async function decideGradeAmendment(tx: Transaction, input: DecideAmendmentInput) {
  const [amendment] = await tx
    .select({
      id: gradeAmendments.id,
      gradeSheetId: gradeAmendments.gradeSheetId,
      gradeComponentId: gradeAmendments.gradeComponentId,
      enrollmentId: gradeAmendments.enrollmentId,
      studentId: gradeAmendments.studentId,
      componentLabel: gradeAmendments.componentLabel,
      oldScore: gradeAmendments.oldScore,
      newScore: gradeAmendments.newScore,
      source: gradeAmendments.source,
      status: gradeAmendments.status,
      requestedByUserId: gradeAmendments.requestedByUserId,
      requestedByName: gradeAmendments.requestedByName,
      requesterRoles: requesterUser.role,
      fullName: students.fullName,
      code: students.code,
    })
    .from(gradeAmendments)
    .innerJoin(students, eq(students.id, gradeAmendments.studentId))
    .leftJoin(requesterUser, eq(requesterUser.id, gradeAmendments.requestedByUserId))
    .where(eq(gradeAmendments.id, input.id))
    .for("update", { of: gradeAmendments });
  if (!amendment) throw new GradeActionError("Đề nghị sửa điểm không còn, tải lại trang.");
  if (amendment.status !== "pending") throw new GradeActionError("Đề nghị đã được xử lý, tải lại trang để xem kết quả.");
  if (input.actor.userId && input.actor.userId === amendment.requestedByUserId) throw new GradeActionError("Bạn là người đề nghị nên không tự duyệt được, cần một cán bộ khác duyệt.");
  const sheet = await lockSheetOf(tx, { gradeSheetId: amendment.gradeSheetId });
  if (!sheet) throw new GradeActionError("Bảng điểm không còn, tải lại trang.");
  const studentLabel = `${amendment.fullName} (${formatStudentCode(amendment.code)})`;
  const entity = { entityType: "grade-sheet" as const, entityId: sheet.id, entityLabel: `${sheet.classCode} ${sheet.courseName}` };
  const decided = { decidedByUserId: input.actor.userId, decidedByName: input.actor.name, decidedAt: sql`now()` };

  if (input.decision === "rejected") {
    await tx.update(gradeAmendments).set({ status: "rejected", decisionNote: input.note, ...decided }).where(eq(gradeAmendments.id, amendment.id));
    await recordAudit(tx, { actor: input.actor, action: "reject", ...entity, summary: `Từ chối đề nghị sửa ${amendment.componentLabel} của ${studentLabel}. Lý do: ${input.note}` });
    await notifyRequester(tx, amendment, {
      title: `Đề nghị sửa điểm lớp ${sheet.classCode} bị từ chối`,
      body: `${amendment.componentLabel} của ${studentLabel}. Lý do: ${input.note}`,
    });
    return { status: "rejected" as const, resultAfter: null };
  }

  const [current] = await tx
    .select({ score: gradeScores.score })
    .from(gradeScores)
    .where(and(eq(gradeScores.gradeComponentId, amendment.gradeComponentId), eq(gradeScores.enrollmentId, amendment.enrollmentId)));
  if ((current?.score ?? null) !== amendment.oldScore) throw new GradeActionError("Điểm của ô này đã thay đổi từ lúc đề nghị. Từ chối đề nghị này và đề nghị lại theo điểm mới.");

  const [columns, scores, [result]] = await Promise.all([
    tx.select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label, weight: gradeComponents.weight }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)).orderBy(asc(gradeComponents.position)),
    tx.select({ componentId: gradeScores.gradeComponentId, score: gradeScores.score }).from(gradeScores).where(eq(gradeScores.enrollmentId, amendment.enrollmentId)),
    tx.select({ id: courseResults.id, score10: courseResults.score10, letter: courseResults.letter }).from(courseResults).where(eq(courseResults.enrollmentId, amendment.enrollmentId)),
  ]);
  const scoreOf = new Map(scores.map((row) => [row.componentId, row.score]));
  scoreOf.set(amendment.gradeComponentId, amendment.newScore);
  const row = Object.fromEntries(columns.map((column) => [column.key, scoreOf.get(column.id) ?? null]));
  // Quy chế lúc công bố (bảng điểm chưa công bố thì bản đang áp dụng, chỉ để ghi tổng dự kiến).
  const regulation = await regulationAt(tx, sheet.publishedAt ? schoolTime(sheet.publishedAt).format("YYYY-MM-DD") : schoolToday());
  const total = weightedScore(columns, row, regulation.grading.roundingStep);
  const graded = total === null ? null : courseGrade(total, regulation.grading.scale);
  const before = sheet.status === "published" ? resultText(result) : "Chưa công bố";
  const after = sheet.status === "published" ? (graded ? resultText(graded) : resultText(result)) : graded ? `Chưa công bố, tổng ${resultText(graded)}` : "Chưa công bố";

  await tx.update(gradeAmendments).set({ status: "approved", decisionNote: input.note || null, resultBefore: before, resultAfter: after, ...decided }).where(eq(gradeAmendments.id, amendment.id));
  await tx
    .insert(gradeScores)
    .values({ gradeComponentId: amendment.gradeComponentId, enrollmentId: amendment.enrollmentId, score: amendment.newScore })
    .onConflictDoUpdate({ target: [gradeScores.gradeComponentId, gradeScores.enrollmentId], set: { score: sql`excluded.score`, updatedAt: sql`now()` } });
  // Kết quả học phần chỉ có sau khi công bố; còn thiếu điểm (sinh viên I chưa thi bù đủ) thì giữ nguyên I.
  if (sheet.status === "published" && graded) {
    if (result) await tx.update(courseResults).set({ score10: graded.score10, letter: graded.letter, point4: graded.point4 }).where(eq(courseResults.id, result.id));
    else {
      const [enrollment] = await tx.select({ courseId: enrollments.courseId, termId: enrollments.termId }).from(enrollments).where(eq(enrollments.id, amendment.enrollmentId));
      await tx.insert(courseResults).values({ studentId: amendment.studentId, courseId: enrollment.courseId, termId: enrollment.termId, enrollmentId: amendment.enrollmentId, source: "class", ...graded });
    }
  }
  await recordAudit(tx, {
    actor: input.actor,
    action: "approve",
    ...entity,
    summary: `Duyệt sửa điểm ${amendment.componentLabel} của ${studentLabel} (${GRADE_AMENDMENT_SOURCE[amendment.source].toLowerCase()}, ${amendment.requestedByName} đề nghị)`,
    changes: [
      { field: `${amendment.componentLabel} của ${studentLabel}`, before: scoreLabel(amendment.oldScore), after: scoreLabel(amendment.newScore) },
      { field: "Kết quả học phần", before, after },
    ],
  });
  if (sheet.status === "published") {
    await notifyStudents(tx, [amendment.studentId], {
      kind: "grade",
      title: `Điểm ${sheet.courseName} đã được điều chỉnh`,
      body: `${amendment.componentLabel}: ${scoreLabel(amendment.oldScore)} thành ${scoreLabel(amendment.newScore)}. Kết quả học phần: ${after}.`,
      href: "/application/grades",
    });
  }
  if (sheet.lecturerId) {
    await notifyLecturers(tx, [sheet.lecturerId], {
      kind: "grade",
      title: `Đã sửa điểm lớp ${sheet.classCode}`,
      body: `${amendment.componentLabel} của ${studentLabel}: ${scoreLabel(amendment.oldScore)} thành ${scoreLabel(amendment.newScore)}. Kết quả học phần: ${after}.`,
      href: `/lecturer/classes/${sheet.classSectionId}/grading`,
    });
  }
  if (amendment.source === "manual") {
    await notifyRequester(tx, amendment, { title: `Đề nghị sửa điểm lớp ${sheet.classCode} đã được duyệt`, body: `${amendment.componentLabel} của ${studentLabel}. Kết quả học phần: ${after}.` });
  }
  return { status: "approved" as const, resultAfter: after };
}

// Người đề nghị là cán bộ (nhập tay) nhận ở cổng quản trị, giảng viên nhận ở cổng giảng viên. Đề nghị theo đơn thì đơn đã báo người gửi.
async function notifyRequester(tx: Transaction, amendment: { requestedByUserId: string | null; requesterRoles: string | null; source: GradeAmendmentSource }, message: { title: string; body: string }) {
  if (!amendment.requestedByUserId || amendment.source === "regrade") return;
  const audience = amendment.source === "manual" || !amendment.requesterRoles?.split(",").includes("lecturer") ? "administrator" : "lecturer";
  await notifyUsers(tx, [amendment.requestedByUserId], audience, {
    kind: "grade",
    ...message,
    href: audience === "administrator" ? "/administrator/grade-amendments" : "/lecturer/classes",
  });
}

// Đơn được duyệt ở bước cuối (phúc khảo, sửa điểm): tạo đề nghị rồi duyệt ngay bởi người duyệt bước cuối, trong cùng giao dịch.
export async function amendFromRequest(tx: Transaction, input: ProposeAmendmentInput & { decider: AuditActor }) {
  const { id } = await proposeGradeAmendment(tx, { ...input, notify: false });
  return decideGradeAmendment(tx, { id, decision: "approved", note: "", actor: input.decider });
}

const SYSTEM_ACTOR: AuditActor = { userId: null, name: "Hệ thống", role: "Tác vụ định kỳ" };

// Tác vụ incomplete-grades: điểm I quá grading.incompleteTerms học kỳ mà chưa có điểm thi bù thì chuyển F (điểm 0), báo sinh viên.
// Chỉ đổi dòng còn là I nên chạy lại không chuyển trùng, không báo trùng.
export async function convertOverdueIncompletes(executor: typeof db = db, today = schoolToday()) {
  return executor.transaction(async (tx) => {
    const regulation = await regulationAt(tx, today);
    const [pending, allTerms] = await Promise.all([
      tx
        .select({ id: courseResults.id, termId: courseResults.termId, studentId: courseResults.studentId, courseName: courses.name, termName: terms.name })
        .from(courseResults)
        .innerJoin(courses, eq(courses.id, courseResults.courseId))
        .innerJoin(terms, eq(terms.id, courseResults.termId))
        .where(eq(courseResults.letter, "I")),
      tx.select({ id: terms.id, startDate: terms.startDate, endDate: terms.endDate }).from(terms),
    ]);
    const overdue = overdueIncompletes(pending, allTerms, regulation.grading.incompleteTerms, today);
    if (overdue.length === 0) return { incompletesConverted: 0 };
    const failing = regulation.grading.scale.at(-1)!;
    const converted = await tx
      .update(courseResults)
      .set({ score10: 0, letter: failing.letter, point4: failing.point4, note: `Điểm I quá ${regulation.grading.incompleteTerms} học kỳ chưa thi bù, chuyển ${failing.letter}` })
      .where(and(inArray(courseResults.id, overdue.map((row) => row.id)), eq(courseResults.letter, "I")))
      .returning({ id: courseResults.id });
    const done = new Set(converted.map((row) => row.id));
    for (const row of overdue.filter((entry) => done.has(entry.id))) {
      await notifyStudents(tx, [row.studentId], {
        kind: "grade",
        title: `Điểm I học phần ${row.courseName} đã chuyển thành ${failing.letter}`,
        body: `Học phần ${row.courseName} (${row.termName}) nhận điểm I do hoãn thi nhưng quá ${regulation.grading.incompleteTerms} học kỳ chưa có điểm thi bù. Liên hệ Phòng Đào tạo nếu đã thi bù.`,
        href: "/application/grades",
      });
      await recordAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: "update",
        entityType: "student",
        entityId: row.studentId,
        entityLabel: row.courseName,
        summary: `Điểm I học phần ${row.courseName} (${row.termName}) quá hạn thi bù, chuyển ${failing.letter}`,
        ip: null,
      });
    }
    return { incompletesConverted: converted.length };
  });
}
