import "server-only";
import { and, asc, count, eq, exists, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { ABSENCE_STATUSES } from "@/modules/schedule/schedule.constant";
import { isOverAbsenceLimit } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { getCurrentStudent } from "@/modules/users/users.query";
import type { ExamAttendance, ExamEligibilityRow, ExamSession } from "@/modules/exams/exams.type";

const teacher = alias(lecturers, "exam_teacher");
const requester = alias(lecturers, "swap_requester");
const substitute = alias(lecturers, "swap_substitute");

const displayName = (table: { title: AnyPgColumn; fullName: AnyPgColumn }) => sql<string>`${table.title} || ' ' || ${table.fullName}`;

// Ca thi kèm lớp, giảng viên dạy lớp, phòng, cán bộ coi thi và đề nghị đổi ca đang chờ. Số thí sinh là sĩ số hiện tại của lớp.
async function examRows(where: SQL): Promise<ExamSession[]> {
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
  return rows.map((row) => ({
    ...row,
    paperDeadline: row.paperDeadline.toISOString(),
    proctors: proctors.filter((proctor) => proctor.examId === row.id).map(({ examId: _examId, ...proctor }) => proctor),
    swapRequests: swaps.filter((swap) => swap.examId === row.id).map(({ examId: _examId, createdAt, ...swap }) => ({ ...swap, createdAt: createdAt.toISOString() })),
  }));
}

export async function getExamSessions(termId: string) {
  await requireSession();
  if (!isUuid(termId)) return [];
  return examRows(eq(examSessions.termId, termId));
}

export async function getExamSession(id: string) {
  await requireSession();
  if (!isUuid(id)) return null;
  const [exam] = await examRows(eq(examSessions.id, id));
  return exam ?? null;
}

// Ca thi của lớp giảng viên dạy và ca giảng viên được phân công coi thi.
export async function getExamsForLecturer(lecturerId: string) {
  await requireSession();
  if (!isUuid(lecturerId)) return [];
  const proctoring = db
    .select({ one: sql`1` })
    .from(examProctors)
    .where(and(eq(examProctors.examSessionId, examSessions.id), eq(examProctors.lecturerId, lecturerId)));
  return examRows(or(eq(classSections.lecturerId, lecturerId), exists(proctoring))!);
}

export async function getExamsForClassSections(classSectionIds: string[]) {
  await requireSession();
  const ids = classSectionIds.filter(isUuid);
  if (ids.length === 0) return [];
  return examRows(inArray(examSessions.classSectionId, ids));
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
