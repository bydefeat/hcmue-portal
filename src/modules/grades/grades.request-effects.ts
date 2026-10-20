import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { InputError } from "@/shared/libs/action.lib";
import type { Transaction } from "@/shared/libs/db.lib";
import { formatDate, schoolToday } from "@/shared/libs/date.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { examCandidates, examDeferrals, examSessions } from "@/modules/exams/exams.schema";
import { notifyLecturers, notifyStudents } from "@/modules/notifications/notifications.lib";
import { pickFinalComponent } from "@/modules/requests/requests.rule";
import { regulationAt } from "@/modules/settings/settings.lib";
import { amendFromRequest } from "@/modules/grades/grade-amendments.lib";
import { loadTranscripts } from "@/modules/grades/grades.lib";
import {
  courseGrade,
  CREDIT_TRANSFER_EFFECT_SCHEMA,
  EXAM_POSTPONE_EFFECT_SCHEMA,
  GRADE_CHANGE_EFFECT_SCHEMA,
  gradeChangeTarget,
  isPassing,
  latestAttempts,
  REGRADE_EFFECT_SCHEMA,
  withdrawBlockedReason,
} from "@/modules/grades/grades.rule";
import { courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import { lecturers, students } from "@/modules/users/users.schema";
import type { z } from "zod";

// Đơn duyệt xong bước cuối (cùng dạng ApprovedRequest của requests.lib, khai báo lại để module điểm không phụ thuộc vòng vào
// module đơn từ). effect: phần người duyệt bước cuối nhập (điểm sau phúc khảo, học phần công nhận...).
export type GradeApprovedRequest = {
  id: string;
  code: string;
  requesterStudentId: string | null;
  requesterLecturerId: string | null;
  classSectionId: string | null;
  details: { label: string; value: string }[];
  actor: AuditActor;
  effect?: unknown;
};

type Handler = (request: GradeApprovedRequest, tx: Transaction) => Promise<void>;

// Lỗi của phần nhập ở bước cuối gắn vào ô "effect.<tên>" để form duyệt hiện đúng chỗ.
function parseEffect<S extends z.ZodType>(schema: S, effect: unknown): z.output<S> {
  const parsed = schema.safeParse(effect ?? undefined);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new InputError(issue?.message ?? "Phần nhập khi duyệt chưa hợp lệ.", ["effect", ...(issue?.path ?? [])].join("."));
}

async function requesterStudent(tx: Transaction, request: GradeApprovedRequest) {
  if (!request.requesterStudentId || !request.classSectionId) throw new InputError("Đơn không gắn với sinh viên và lớp học phần nên không cập nhật được kết quả.");
  const [row] = await tx
    .select({
      studentId: students.id,
      userId: students.userId,
      fullName: students.fullName,
      code: students.code,
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      termId: enrollments.termId,
      sectionCode: classSections.code,
      lecturerId: classSections.lecturerId,
      courseName: courses.name,
      termStart: terms.startDate,
      termEnd: terms.endDate,
    })
    .from(students)
    .innerJoin(enrollments, and(eq(enrollments.studentId, students.id), eq(enrollments.classSectionId, request.classSectionId), eq(enrollments.status, "enrolled")))
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(terms, eq(terms.id, enrollments.termId))
    .where(eq(students.id, request.requesterStudentId))
    .for("update", { of: enrollments });
  if (!row) throw new InputError("Sinh viên không còn đăng ký lớp học phần của đơn.");
  return row;
}

async function sheetOf(tx: Transaction, classSectionId: string) {
  const [sheet] = await tx.select({ id: gradeSheets.id, status: gradeSheets.status }).from(gradeSheets).where(eq(gradeSheets.classSectionId, classSectionId));
  return sheet ?? null;
}

// Phúc khảo: Phòng Khảo thí nhập điểm thi cuối kỳ sau chấm lại (có thể giữ nguyên). Điểm đổi thì sinh đề nghị sửa điểm đã duyệt
// (người đề nghị là sinh viên gửi đơn, người duyệt là người duyệt bước cuối) và tính lại kết quả học phần.
const regrade: Handler = async (request, tx) => {
  const { newScore } = parseEffect(REGRADE_EFFECT_SCHEMA, request.effect);
  const student = await requesterStudent(tx, request);
  const sheet = await sheetOf(tx, request.classSectionId!);
  if (sheet?.status !== "published") throw new InputError("Lớp chưa công bố điểm nên chưa cập nhật được điểm phúc khảo.");
  const components = await tx.select({ id: gradeComponents.id, key: gradeComponents.key, label: gradeComponents.label }).from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id));
  const final = pickFinalComponent(components);
  if (!final) throw new InputError("Bảng điểm của lớp không xác định được cột điểm thi cuối kỳ; cập nhật bằng đề nghị sửa điểm ở trang Sửa điểm.");
  const [current] = await tx.select({ score: gradeScores.score }).from(gradeScores).where(and(eq(gradeScores.gradeComponentId, final.id), eq(gradeScores.enrollmentId, student.enrollmentId)));
  if ((current?.score ?? null) === newScore) {
    await recordAudit(tx, {
      actor: request.actor,
      action: "update",
      entityType: "grade-sheet",
      entityId: sheet.id,
      entityLabel: `${student.sectionCode} ${student.courseName}`,
      summary: `Phúc khảo theo đơn ${request.code}: giữ nguyên ${final.label} của ${student.fullName} (${formatStudentCode(student.code)})`,
    });
    return;
  }
  await amendFromRequest(tx, {
    classSectionId: request.classSectionId!,
    studentId: student.studentId,
    componentKey: final.key,
    newScore,
    reason: `Phúc khảo theo đơn ${request.code}`,
    source: "regrade",
    requestId: request.id,
    requester: { userId: student.userId, name: student.fullName, role: "Sinh viên" },
    decider: request.actor,
  });
};

// Sửa điểm của giảng viên: Phòng Đào tạo duyệt bước cuối với điểm giảng viên đề nghị (hoặc điểm nhập lại khi duyệt).
const gradeChange: Handler = async (request, tx) => {
  if (!request.requesterLecturerId || !request.classSectionId) throw new InputError("Đơn không gắn với lớp học phần nên không cập nhật được điểm.");
  const target = gradeChangeTarget(request.details);
  if (!target) throw new InputError("Đơn không ghi rõ sinh viên và cột điểm; cập nhật bằng đề nghị sửa điểm ở trang Sửa điểm.");
  const effect = parseEffect(GRADE_CHANGE_EFFECT_SCHEMA, request.effect);
  const newScore = effect.newScore ?? target.newScore;
  if (newScore === null) throw new InputError("Nhập điểm mới trước khi duyệt.", "effect.newScore");
  const [[student], [lecturer]] = await Promise.all([
    tx
      .select({ id: students.id })
      .from(students)
      .innerJoin(enrollments, and(eq(enrollments.studentId, students.id), eq(enrollments.classSectionId, request.classSectionId), eq(enrollments.status, "enrolled")))
      .where(eq(students.code, target.studentCode)),
    tx.select({ userId: lecturers.userId, title: lecturers.title, fullName: lecturers.fullName }).from(lecturers).where(eq(lecturers.id, request.requesterLecturerId)),
  ]);
  if (!student) throw new InputError("Sinh viên trong đơn không còn trong danh sách lớp.");
  await amendFromRequest(tx, {
    classSectionId: request.classSectionId,
    studentId: student.id,
    componentLabel: target.componentLabel,
    newScore,
    reason: `Sửa điểm theo đơn ${request.code}`,
    source: "grade-change",
    requestId: request.id,
    requester: { userId: lecturer?.userId ?? null, name: lecturer ? `${lecturer.title} ${lecturer.fullName}` : "Giảng viên", role: "Giảng viên" },
    decider: request.actor,
  });
};

// Rút học phần: kiểm lại hạn rút theo quy chế ngày duyệt, đăng ký chuyển sang đã rút (không tính tín chỉ tối thiểu, rời lớp), kết
// quả ghi W. Học phí không hoàn: hóa đơn giữ nguyên (tuition tính tín chỉ cả đăng ký đã rút).
const withdraw: Handler = async (request, tx) => {
  const student = await requesterStudent(tx, request);
  const today = schoolToday();
  const [regulation, sheet] = await Promise.all([regulationAt(tx, today), sheetOf(tx, request.classSectionId!)]);
  const blocked = withdrawBlockedReason({ termStart: student.termStart, termEnd: student.termEnd, sheetStatus: sheet?.status ?? null }, today, regulation.workflow.withdrawDeadlineWeeks);
  if (blocked) throw new InputError(blocked);
  await tx.update(enrollments).set({ status: "withdrawn", withdrawnAt: new Date() }).where(eq(enrollments.id, student.enrollmentId));
  await tx.insert(courseResults).values({
    studentId: student.studentId,
    courseId: student.courseId,
    termId: student.termId,
    enrollmentId: student.enrollmentId,
    source: "class",
    letter: "W",
    requestId: request.id,
    note: `Rút học phần theo đơn ${request.code}`,
  });
  await recordAudit(tx, {
    actor: request.actor,
    action: "update",
    entityType: "student",
    entityId: student.studentId,
    entityLabel: `${student.fullName} (${formatStudentCode(student.code)})`,
    summary: `Rút học phần ${student.sectionCode} ${student.courseName} theo đơn ${request.code}: kết quả W, học phí không hoàn`,
  });
  await notifyStudents(tx, [student.studentId], {
    kind: "grade",
    title: `Đã rút học phần ${student.courseName}`,
    body: `Lớp ${student.sectionCode} ghi kết quả W (không tính điểm trung bình, không tính tín chỉ tích lũy). Học phí của học phần không được hoàn.`,
    href: "/application/grades",
  });
  if (student.lecturerId) {
    await notifyLecturers(tx, [student.lecturerId], {
      kind: "grade",
      title: `Sinh viên rút học phần lớp ${student.sectionCode}`,
      body: `${student.fullName} (${formatStudentCode(student.code)}) đã rút học phần theo đơn ${request.code}, không còn trong danh sách lớp và bảng điểm.`,
      href: `/lecturer/classes/${request.classSectionId}/grading`,
    });
  }
};

// Ngày thi sinh viên khai (DD/MM/YYYY) so với lịch thi của lớp để biết hoãn ca nào; không khớp thì hoãn thi cuối kỳ.
function declaredExamDate(details: GradeApprovedRequest["details"]) {
  const value = details.find((detail) => detail.label.startsWith("Ngày thi"))?.value;
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

// Hoãn thi: ghi exam_deferrals gắn với đơn, sinh viên rời danh sách thi ca chưa diễn ra; công bố điểm thì sinh viên nhận I.
const examPostpone: Handler = async (request, tx) => {
  const student = await requesterStudent(tx, request);
  const effect = parseEffect(EXAM_POSTPONE_EFFECT_SCHEMA, request.effect);
  const sheet = await sheetOf(tx, request.classSectionId!);
  if (sheet?.status === "published") throw new InputError("Lớp đã công bố điểm; điều chỉnh kết quả bằng đề nghị sửa điểm.");
  const sessions = await tx
    .select({ id: examSessions.id, kind: examSessions.kind, date: examSessions.date })
    .from(examSessions)
    .where(and(eq(examSessions.classSectionId, request.classSectionId!), inArray(examSessions.kind, ["midterm", "final"])));
  const declared = declaredExamDate(request.details);
  const kind = effect.examKind ?? (sessions.find((session) => session.date === declared)?.kind as "midterm" | "final" | undefined) ?? "final";
  const [row] = await tx
    .insert(examDeferrals)
    .values({ enrollmentId: student.enrollmentId, kind, reason: `Hoãn thi theo đơn ${request.code}`, requestId: request.id, decidedByUserId: request.actor.userId })
    .onConflictDoNothing({ target: [examDeferrals.enrollmentId, examDeferrals.kind] })
    .returning({ id: examDeferrals.id });
  if (!row) throw new InputError(`Sinh viên đã được ghi nhận hoãn thi ${kind === "final" ? "cuối kỳ" : "giữa kỳ"} lớp này.`);
  const session = sessions.find((entry) => entry.kind === kind);
  if (session) {
    await tx
      .delete(examCandidates)
      .where(
        and(
          eq(examCandidates.examSessionId, session.id),
          eq(examCandidates.enrollmentId, student.enrollmentId),
          sql`(SELECT (${examSessions.date} + ${examSessions.startTime}) AT TIME ZONE 'Asia/Ho_Chi_Minh' FROM ${examSessions} WHERE ${examSessions.id} = ${session.id}) > now()`,
        ),
      );
  }
  const kindLabel = kind === "final" ? "cuối kỳ" : "giữa kỳ";
  await recordAudit(tx, {
    actor: request.actor,
    action: "approve",
    entityType: "exam",
    entityId: student.enrollmentId,
    entityLabel: `${student.fullName} - ${student.sectionCode}`,
    summary: `Cho hoãn thi ${kindLabel} theo đơn ${request.code}: ${student.fullName} (${student.sectionCode})${session ? `, ca ngày ${formatDate(session.date)}` : ""}`,
  });
  await notifyStudents(tx, [student.studentId], {
    kind: "exam",
    title: `Được hoãn thi ${kindLabel} ${student.sectionCode}`,
    body: `Bạn không thi ca ${kindLabel} ${student.courseName}. Khi công bố điểm, học phần ghi I (chưa hoàn thiện) cho tới khi có điểm thi bù.`,
    href: "/application/exams",
  });
};

// Công nhận, miễn: Phòng Đào tạo nhập từng học phần ở bước cuối. Công nhận điểm thì ghi điểm (tính CPA), miễn thì ghi M (tính tín chỉ
// tích lũy, không tính CPA). Ghi vào học kỳ hiện tại; học phần đã học đạt thì không công nhận lại.
const creditTransfer: Handler = async (request, tx) => {
  if (!request.requesterStudentId) throw new InputError("Đơn không gắn với sinh viên.");
  const effect = parseEffect(CREDIT_TRANSFER_EFFECT_SCHEMA, request.effect);
  const today = schoolToday();
  const [[term], picked, [student], regulation] = await Promise.all([
    tx
      .select({ id: terms.id, name: terms.name })
      .from(terms)
      .where(sql`${terms.startDate} <= ${today}::date`)
      .orderBy(desc(terms.isCurrent), desc(terms.startDate))
      .limit(1),
    tx
      .select({ id: courses.id, code: courses.code, name: courses.name })
      .from(courses)
      .where(inArray(courses.id, effect.courses.map((course) => course.courseId))),
    tx.select({ fullName: students.fullName, code: students.code }).from(students).where(eq(students.id, request.requesterStudentId)),
    regulationAt(tx, today),
  ]);
  if (!term) throw new InputError("Chưa có học kỳ nào để ghi kết quả công nhận.");
  if (picked.length !== effect.courses.length) throw new InputError("Có học phần không còn trong danh mục, tải lại trang.", "effect.courses");
  const transcript = (await loadTranscripts(tx, [request.requesterStudentId])).get(request.requesterStudentId) ?? [];
  const latest = latestAttempts(transcript.filter((entry) => !entry.isInProgress).flatMap((entry) => entry.courses));
  const byId = new Map(picked.map((course) => [course.id, course]));
  const passed = picked.filter((course) => {
    const last = latest.get(course.code);
    return last ? isPassing(last) : false;
  });
  if (passed.length > 0) throw new InputError(`Sinh viên đã học đạt ${passed.map((course) => course.code).join(", ")}, không cần công nhận.`, "effect.courses");
  const rows = effect.courses.map((course) => {
    const base = { studentId: request.requesterStudentId!, courseId: course.courseId, termId: term.id, requestId: request.id, note: `Theo đơn ${request.code}` };
    return course.mode === "exemption"
      ? { ...base, source: "exemption" as const, letter: "M" }
      : { ...base, source: "transfer" as const, ...courseGrade(course.score10!, regulation.grading.scale) };
  });
  const inserted = await tx
    .insert(courseResults)
    .values(rows)
    .onConflictDoNothing({ target: [courseResults.studentId, courseResults.courseId, courseResults.termId] })
    .returning({ courseId: courseResults.courseId });
  if (inserted.length !== rows.length) throw new InputError(`Sinh viên đã có kết quả học phần trong ${term.name} cho một số học phần đã chọn.`, "effect.courses");
  const summary = effect.courses.map((course) => `${byId.get(course.courseId)!.code} ${course.mode === "exemption" ? "M" : String(course.score10).replace(".", ",")}`).join(", ");
  await recordAudit(tx, {
    actor: request.actor,
    action: "create",
    entityType: "student",
    entityId: request.requesterStudentId,
    entityLabel: student ? `${student.fullName} (${formatStudentCode(student.code)})` : request.code,
    summary: `Công nhận, miễn học phần theo đơn ${request.code}: ${summary}`,
  });
  await notifyStudents(tx, [request.requesterStudentId], {
    kind: "grade",
    title: `Đã công nhận ${rows.length} học phần`,
    body: `${summary}. Học phần miễn (M) tính tín chỉ tích lũy, không tính điểm trung bình. Xem ở mục Kết quả học tập.`,
    href: "/application/grades",
  });
};

// Đăng ký vào REQUEST_APPROVED_HANDLERS của module đơn từ.
export const GRADE_REQUEST_HANDLERS = {
  regrade,
  "grade-change": gradeChange,
  withdraw,
  "exam-postpone": examPostpone,
  "credit-transfer": creditTransfer,
} satisfies Record<string, Handler>;
