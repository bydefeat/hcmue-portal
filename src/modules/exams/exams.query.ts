import "server-only";
import { and, asc, count, eq, exists, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { ABSENCE_STATUSES } from "@/modules/schedule/schedule.constant";
import { isOverAbsenceLimit } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { getCurrentStudent } from "@/modules/users/users.query";
import type { ExamAttendance, ExamEligibilityRow, ExamPaperFile, ExamPaperFileKind, ExamSession } from "@/modules/exams/exams.type";

const teacher = alias(lecturers, "exam_teacher");
const requester = alias(lecturers, "swap_requester");
const substitute = alias(lecturers, "swap_substitute");

const displayName = (table: { title: AnyPgColumn; fullName: AnyPgColumn }) => sql<string>`${table.title} || ' ' || ${table.fullName}`;

// Ca thi kèm lớp, giảng viên dạy lớp, phòng, cán bộ coi thi và đề nghị đổi ca đang chờ. Số thí sinh là sĩ số hiện tại của lớp.
// Tên tệp đề, đáp án chỉ trả cho ca mà `showPapers` cho phép (giảng viên dạy lớp, Phòng Khảo thí).
async function examRows(where: SQL, showPapers: (row: { lecturerId: string | null; faculty: string }) => boolean = () => false): Promise<ExamSession[]> {
  const rows = await db
    .select({
      id: examSessions.id,
      termId: examSessions.termId,
      kind: examSessions.kind,
      classSectionId: examSessions.classSectionId,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerId: classSections.lecturerId,
      lecturerName: sql<string | null>`CASE WHEN ${teacher.id} IS NULL THEN NULL ELSE ${displayName(teacher)} END`,
      faculty: faculties.name,
      date: examSessions.date,
      startTime: sql<string>`to_char(${examSessions.startTime}, 'HH24:MI')`,
      durationMinutes: examSessions.durationMinutes,
      room: rooms.code,
      format: examSessions.format,
      candidateCount: classSections.enrolledCount,
      status: examSessions.status,
      paperStatus: examSessions.paperStatus,
      paperDeadline: examSessions.paperDeadline,
      paperSubmittedAt: examSessions.paperSubmittedAt,
      paperFileName: examSessions.paperFileName,
      paperSizeBytes: examSessions.paperSizeBytes,
      answerKeyFileName: examSessions.answerKeyFileName,
      answerKeySizeBytes: examSessions.answerKeySizeBytes,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .innerJoin(rooms, eq(rooms.id, examSessions.roomId))
    .leftJoin(teacher, eq(teacher.id, classSections.lecturerId))
    .where(where)
    .orderBy(asc(examSessions.date), asc(examSessions.startTime), asc(classSections.code));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [proctors, swaps] = await Promise.all([
    db
      .select({ examId: examProctors.examSessionId, id: lecturers.id, name: displayName(lecturers) })
      .from(examProctors)
      .innerJoin(lecturers, eq(lecturers.id, examProctors.lecturerId))
      .where(inArray(examProctors.examSessionId, ids))
      .orderBy(asc(lecturers.code)),
    db
      .select({
        examId: examProctorSwapRequests.examSessionId,
        requesterId: examProctorSwapRequests.requesterId,
        requesterName: displayName(requester),
        substituteId: examProctorSwapRequests.substituteId,
        substituteName: displayName(substitute),
        reason: examProctorSwapRequests.reason,
        createdAt: examProctorSwapRequests.createdAt,
      })
      .from(examProctorSwapRequests)
      .innerJoin(requester, eq(requester.id, examProctorSwapRequests.requesterId))
      .innerJoin(substitute, eq(substitute.id, examProctorSwapRequests.substituteId))
      .where(and(inArray(examProctorSwapRequests.examSessionId, ids), isNull(examProctorSwapRequests.resolvedAt)))
      .orderBy(asc(examProctorSwapRequests.createdAt)),
  ]);
  const papersOf = (row: (typeof rows)[number]): ExamPaperFile[] => {
    if (!showPapers(row)) return [];
    const files: ExamPaperFile[] = [];
    if (row.paperFileName && row.paperSizeBytes) files.push({ kind: "paper", fileName: row.paperFileName, sizeBytes: row.paperSizeBytes });
    if (row.answerKeyFileName && row.answerKeySizeBytes) files.push({ kind: "answer-key", fileName: row.answerKeyFileName, sizeBytes: row.answerKeySizeBytes });
    return files;
  };
  return rows.map(({ paperFileName: _a, paperSizeBytes: _b, answerKeyFileName: _c, answerKeySizeBytes: _d, ...row }, index) => ({
    ...row,
    paperDeadline: row.paperDeadline.toISOString(),
    paperSubmittedAt: row.paperSubmittedAt?.toISOString() ?? null,
    papers: papersOf(rows[index]),
    proctors: proctors.filter((proctor) => proctor.examId === row.id).map(({ examId: _examId, ...proctor }) => proctor),
    swapRequests: swaps.filter((swap) => swap.examId === row.id).map(({ examId: _examId, createdAt, ...swap }) => ({ ...swap, createdAt: createdAt.toISOString() })),
  }));
}

// Cán bộ có quyền quản lý thi theo vai trò đang dùng; tài khoản không phải cán bộ thì null.
async function examManager(roles: string[]) {
  if (!roles.includes("admin")) return null;
  const viewer = await getViewer();
  return can(viewer, "exams.manage") ? viewer : null;
}

async function paperVisibility() {
  const { roles } = await requireSession();
  const manager = await examManager(roles);
  return (row: { faculty: string }) => manager !== null && inScope(manager, row.faculty);
}

export async function getExamSessions(termId: string) {
  const showPapers = await paperVisibility();
  if (!isUuid(termId)) return [];
  return examRows(eq(examSessions.termId, termId), showPapers);
}

export async function getExamSession(id: string) {
  const showPapers = await paperVisibility();
  if (!isUuid(id)) return null;
  const [exam] = await examRows(eq(examSessions.id, id), showPapers);
  return exam ?? null;
}

// Tệp đề thi hoặc đáp án để tải xuống: chỉ giảng viên dạy lớp (người nộp đề) và cán bộ có quyền quản lý thi trong phạm vi khoa.
export async function getExamPaperFile(examSessionId: string, kind: ExamPaperFileKind) {
  const { user, roles } = await requireSession();
  if (!isUuid(examSessionId)) return null;
  const [row] = await db
    .select({
      faculty: faculties.name,
      teacherUserId: teacher.userId,
      paperStorageKey: examSessions.paperStorageKey,
      paperFileName: examSessions.paperFileName,
      paperContentType: examSessions.paperContentType,
      answerKeyStorageKey: examSessions.answerKeyStorageKey,
      answerKeyFileName: examSessions.answerKeyFileName,
      answerKeyContentType: examSessions.answerKeyContentType,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .leftJoin(teacher, eq(teacher.id, classSections.lecturerId))
    .where(eq(examSessions.id, examSessionId));
  if (!row) return null;
  if (row.teacherUserId !== user.id) {
    const manager = await examManager(roles);
    if (!manager || !inScope(manager, row.faculty)) return null;
  }
  const file =
    kind === "paper"
      ? { storageKey: row.paperStorageKey, fileName: row.paperFileName, contentType: row.paperContentType }
      : { storageKey: row.answerKeyStorageKey, fileName: row.answerKeyFileName, contentType: row.answerKeyContentType };
  if (!file.storageKey || !file.fileName || !file.contentType) return null;
  return { storageKey: file.storageKey, fileName: file.fileName, contentType: file.contentType };
}

// Ca thi của lớp giảng viên dạy và ca giảng viên được phân công coi thi. Chỉ chính giảng viên đó xem được.
export async function getExamsForLecturer(lecturerId: string) {
  const { user } = await requireSession();
  if (!isUuid(lecturerId)) return [];
  const [own] = await db.select({ id: lecturers.id }).from(lecturers).where(and(eq(lecturers.id, lecturerId), eq(lecturers.userId, user.id)));
  if (!own) return [];
  const proctoring = db
    .select({ one: sql`1` })
    .from(examProctors)
    .where(and(eq(examProctors.examSessionId, examSessions.id), eq(examProctors.lecturerId, lecturerId)));
  return examRows(or(eq(classSections.lecturerId, lecturerId), exists(proctoring))!, (row) => row.lecturerId === lecturerId);
}

// Lịch thi theo lớp: chỉ trả lớp mà người gọi là giảng viên dạy hoặc sinh viên đang học, hoặc cán bộ quản lý thi trong phạm vi khoa.
export async function getExamsForClassSections(classSectionIds: string[]) {
  const { user, roles } = await requireSession();
  const ids = classSectionIds.filter(isUuid);
  if (ids.length === 0) return [];
  const studying = db
    .select({ one: sql`1` })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, classSections.id), eq(enrollments.status, "enrolled"), eq(students.userId, user.id)));
  const [ownRows, manager] = await Promise.all([
    db
      .select({ id: classSections.id })
      .from(classSections)
      .leftJoin(teacher, eq(teacher.id, classSections.lecturerId))
      .where(and(inArray(classSections.id, ids), or(eq(teacher.userId, user.id), exists(studying)))),
    examManager(roles),
  ]);
  const own = new Set(ownRows.map((row) => row.id));
  if (own.size === 0 && !manager) return [];
  const rows = await examRows(inArray(examSessions.classSectionId, manager ? ids : [...own]));
  return rows.filter((row) => own.has(row.classSectionId) || (manager !== null && inScope(manager, row.faculty)));
}

// Số buổi đã học và số buổi vắng của từng đăng ký, tính từ điểm danh của giảng viên. Buổi thực hành chỉ tính cho
// sinh viên của nhóm đó; buổi chưa điểm danh chưa tính là đã học.
function attendanceTotals(where: SQL) {
  return db
    .select({
      enrollmentId: enrollments.id,
      classSectionId: enrollments.classSectionId,
      studentId: enrollments.studentId,
      held: count(classSessions.id),
      absences: count(attendanceRecords.enrollmentId),
      overrideReason: examEligibilityOverrides.reason,
    })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(
      classSessions,
      and(
        eq(classSessions.classSectionId, enrollments.classSectionId),
        isNotNull(classSessions.takenAt),
        or(isNull(classSessions.labGroupId), eq(classSessions.labGroupId, enrollments.labGroupId)),
      ),
    )
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.classSessionId, classSessions.id),
        eq(attendanceRecords.enrollmentId, enrollments.id),
        inArray(attendanceRecords.status, [...ABSENCE_STATUSES]),
      ),
    )
    .leftJoin(examEligibilityOverrides, eq(examEligibilityOverrides.enrollmentId, enrollments.id))
    .where(and(eq(enrollments.status, "enrolled"), eq(classSections.status, "open"), where))
    .groupBy(enrollments.id, examEligibilityOverrides.reason);
}

// Sinh viên vắng từ ngưỡng quy chế trở lên trong học kỳ, kèm quyết định cho dự thi nếu có.
export async function getExamEligibility(termId: string, limitPercent: number): Promise<ExamEligibilityRow[]> {
  await requirePermission("exams.manage");
  if (!isUuid(termId)) return [];
  const totals = (await attendanceTotals(eq(enrollments.termId, termId))).filter((row) => isOverAbsenceLimit(row.absences, row.held, limitPercent));
  if (totals.length === 0) return [];
  const people = await db
    .select({
      enrollmentId: enrollments.id,
      studentCode: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
      sectionCode: classSections.code,
      courseName: courses.name,
      faculty: faculties.name,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(
      inArray(
        enrollments.id,
        totals.map((row) => row.enrollmentId),
      ),
    );
  const personOf = new Map(people.map((person) => [person.enrollmentId, person]));
  return totals
    .map((row) => {
      const person = personOf.get(row.enrollmentId)!;
      return {
        key: row.enrollmentId,
        enrollmentId: row.enrollmentId,
        studentId: row.studentId,
        studentCode: formatStudentCode(person.studentCode),
        fullName: person.fullName,
        className: person.className,
        sectionCode: person.sectionCode,
        courseName: person.courseName,
        faculty: person.faculty,
        absences: row.absences,
        sessions: row.held,
        ratio: row.absences / row.held,
        overrideReason: row.overrideReason,
      };
    })
    .toSorted((a, b) => a.sectionCode.localeCompare(b.sectionCode) || b.ratio - a.ratio || a.fullName.localeCompare(b.fullName, "vi"));
}

// Chuyên cần của sinh viên đang đăng nhập trong các lớp của học kỳ, để biết có bị cấm thi không.
export async function getStudentExamAttendance(termId: string): Promise<ExamAttendance[]> {
  const student = await getCurrentStudent();
  if (!isUuid(termId)) return [];
  const rows = await attendanceTotals(and(eq(enrollments.termId, termId), eq(enrollments.studentId, student.id))!);
  return rows.map((row) => ({ classSectionId: row.classSectionId, absences: row.absences, sessionsHeld: row.held, overrideReason: row.overrideReason }));
}
