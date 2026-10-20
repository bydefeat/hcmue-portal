import "server-only";
import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { user as accounts } from "@/modules/authentication/authentication.schema";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, requirePermission } from "@/modules/access/access.query";
import type { Permission } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { EXAM_KIND_LABEL } from "@/modules/exams/exams.constant";
import { examHasStarted, sharedCandidateCounts, termSchedule } from "@/modules/exams/exams.lib";
import { examConflicts, isBannedFromExam } from "@/modules/exams/exams.rule";
import {
  examCandidates,
  examDeferrals,
  examEligibilityOverrides,
  examProctors,
  examProctorSwapRequests,
  examSessionRooms,
  examSessions,
} from "@/modules/exams/exams.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { ABSENCE_STATUSES } from "@/modules/schedule/schedule.constant";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { getCurrentStudent } from "@/modules/users/users.query";
import type {
  ExamAttendance,
  ExamClassOption,
  ExamDeferralRow,
  ExamEligibilityRow,
  ExamPaperFile,
  ExamPaperFileKind,
  ExamRosterRow,
  ExamSession,
  StudentExam,
} from "@/modules/exams/exams.type";

const teacher = alias(lecturers, "exam_teacher");
const requester = alias(lecturers, "swap_requester");
const substitute = alias(lecturers, "swap_substitute");
const reviewer = alias(accounts, "paper_reviewer");
const original = alias(examSessions, "exam_original");

const displayName = (table: { title: AnyPgColumn; fullName: AnyPgColumn }) => sql<string>`${table.title} || ' ' || ${table.fullName}`;

type RowOptions = {
  // Tên tệp đề, đáp án chỉ trả cho ca mà hàm này cho phép (giảng viên dạy lớp, Phòng Khảo thí trong phạm vi khoa).
  showPapers?: (row: { lecturerId: string | null; faculty: string }) => boolean;
  // Tính xung đột trên toàn học kỳ (trang Phòng Khảo thí); trang khác không cần.
  withConflicts?: boolean;
};

// Ca thi kèm lớp, giảng viên dạy lớp, phòng (số thí sinh từng phòng), cán bộ coi thi, đề nghị đổi ca và xung đột.
async function examRows(where: SQL, options: RowOptions = {}): Promise<ExamSession[]> {
  const showPapers = options.showPapers ?? (() => false);
  const rows = await db
    .select({
      id: examSessions.id,
      termId: examSessions.termId,
      kind: examSessions.kind,
      makeupOfKind: original.kind,
      classSectionId: examSessions.classSectionId,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerId: classSections.lecturerId,
      lecturerName: sql<string | null>`CASE WHEN ${teacher.id} IS NULL THEN NULL ELSE ${displayName(teacher)} END`,
      faculty: faculties.name,
      date: examSessions.date,
      startTime: sql<string>`to_char(${examSessions.startTime}, 'HH24:MI')`,
      durationMinutes: examSessions.durationMinutes,
      format: examSessions.format,
      status: examSessions.status,
      hasStarted: examHasStarted,
      paperStatus: examSessions.paperStatus,
      paperDeadline: examSessions.paperDeadline,
      paperSubmittedAt: examSessions.paperSubmittedAt,
      paperFileName: examSessions.paperFileName,
      paperSizeBytes: examSessions.paperSizeBytes,
      answerKeyFileName: examSessions.answerKeyFileName,
      answerKeySizeBytes: examSessions.answerKeySizeBytes,
      reviewerName: reviewer.name,
      paperReviewedAt: examSessions.paperReviewedAt,
      paperReturnReason: examSessions.paperReturnReason,
      // Sinh viên cần xếp: ca thi bù là số đã chọn; ca thường là đang học trừ người được hoãn kỳ thi này.
      expectedCandidates: sql<number>`CASE WHEN ${examSessions.kind}::text = 'makeup'
        THEN (SELECT count(*) FROM exam_candidates c WHERE c.exam_session_id = ${examSessions.id})
        ELSE (SELECT count(*) FROM enrollments e WHERE e.class_section_id = ${examSessions.classSectionId} AND e.status = 'enrolled'
          AND NOT EXISTS (SELECT 1 FROM exam_deferrals d WHERE d.enrollment_id = e.id AND d.kind = ${examSessions.kind})) END::int`,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .leftJoin(original, eq(original.id, examSessions.makeupOfId))
    .leftJoin(teacher, eq(teacher.id, classSections.lecturerId))
    .leftJoin(reviewer, eq(reviewer.id, examSessions.paperReviewedByUserId))
    .where(where)
    .orderBy(asc(examSessions.date), asc(examSessions.startTime), asc(classSections.code));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [roomRows, proctors, counts, swaps] = await Promise.all([
    db
      .select({ examId: examSessionRooms.examSessionId, id: examSessionRooms.id, roomId: rooms.id, code: rooms.code, examCapacity: rooms.examCapacity })
      .from(examSessionRooms)
      .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
      .where(inArray(examSessionRooms.examSessionId, ids))
      .orderBy(asc(examSessionRooms.position)),
    db
      .select({ examId: examProctors.examSessionId, examRoomId: examProctors.examRoomId, id: lecturers.id, name: displayName(lecturers) })
      .from(examProctors)
      .innerJoin(lecturers, eq(lecturers.id, examProctors.lecturerId))
      .where(inArray(examProctors.examSessionId, ids))
      .orderBy(asc(lecturers.code)),
    db
      .select({ examRoomId: examCandidates.examRoomId, total: sql<number>`count(*)::int` })
      .from(examCandidates)
      .where(inArray(examCandidates.examSessionId, ids))
      .groupBy(examCandidates.examRoomId),
    db
      .select({
        id: examProctorSwapRequests.id,
        examId: examProctorSwapRequests.examSessionId,
        requesterId: examProctorSwapRequests.requesterId,
        requesterName: displayName(requester),
        substituteId: examProctorSwapRequests.substituteId,
        substituteName: displayName(substitute),
        reason: examProctorSwapRequests.reason,
        createdAt: examProctorSwapRequests.createdAt,
        decision: examProctorSwapRequests.decision,
        resolvedAt: examProctorSwapRequests.resolvedAt,
        resolveNote: examProctorSwapRequests.resolveNote,
      })
      .from(examProctorSwapRequests)
      .innerJoin(requester, eq(requester.id, examProctorSwapRequests.requesterId))
      .innerJoin(substitute, eq(substitute.id, examProctorSwapRequests.substituteId))
      .where(inArray(examProctorSwapRequests.examSessionId, ids))
      .orderBy(desc(examProctorSwapRequests.createdAt)),
  ]);
  const countOf = new Map(counts.map((row) => [row.examRoomId, row.total]));
  const conflictsOf = new Map<string, ExamSession["conflicts"]>();
  if (options.withConflicts) {
    const termIds = [...new Set(rows.map((row) => row.termId))];
    for (const termId of termIds) {
      const [schedule, shared] = await Promise.all([termSchedule(db, termId), sharedCandidateCounts(db, termId)]);
      for (const session of schedule) conflictsOf.set(session.id, examConflicts(session, schedule, shared.get(session.id) ?? {}));
    }
  }
  const papersOf = (row: (typeof rows)[number]): ExamPaperFile[] => {
    if (!showPapers(row)) return [];
    const files: ExamPaperFile[] = [];
    if (row.paperFileName && row.paperSizeBytes) files.push({ kind: "paper", fileName: row.paperFileName, sizeBytes: row.paperSizeBytes });
    if (row.answerKeyFileName && row.answerKeySizeBytes) files.push({ kind: "answer-key", fileName: row.answerKeyFileName, sizeBytes: row.answerKeySizeBytes });
    return files;
  };
  return rows.map((row) => {
    const { paperFileName: _a, paperSizeBytes: _b, answerKeyFileName: _c, answerKeySizeBytes: _d, reviewerName, paperReviewedAt, paperReturnReason, ...rest } = row;
    const ownRooms = roomRows.filter((room) => room.examId === row.id);
    const ownProctors = proctors.filter((proctor) => proctor.examId === row.id);
    const examRooms = ownRooms.map((room) => ({
      id: room.id,
      roomId: room.roomId,
      code: room.code,
      examCapacity: room.examCapacity,
      candidates: countOf.get(room.id) ?? 0,
      proctors: ownProctors.filter((proctor) => proctor.examRoomId === room.id).map(({ id, name }) => ({ id, name })),
    }));
    return {
      ...rest,
      paperDeadline: row.paperDeadline.toISOString(),
      paperSubmittedAt: row.paperSubmittedAt?.toISOString() ?? null,
      papers: papersOf(row),
      paperReview: showPapers(row) && paperReviewedAt ? { reviewerName, reviewedAt: paperReviewedAt.toISOString(), returnReason: paperReturnReason } : null,
      rooms: examRooms,
      candidateCount: examRooms.reduce((sum, room) => sum + room.candidates, 0),
      proctors: ownProctors.map((proctor) => ({ id: proctor.id, name: proctor.name, room: ownRooms.find((room) => room.id === proctor.examRoomId)?.code ?? "" })),
      swapRequests: swaps
        .filter((swap) => swap.examId === row.id)
        .map(({ examId: _examId, createdAt, resolvedAt, ...swap }) => ({ ...swap, createdAt: createdAt.toISOString(), resolvedAt: resolvedAt?.toISOString() ?? null })),
      conflicts: conflictsOf.get(row.id) ?? [],
    };
  });
}

// Cán bộ có quyền về thi theo vai trò đang dùng; tài khoản không phải cán bộ thì null.
async function examStaff(roles: string[], permission: Permission) {
  if (!roles.includes("admin")) return null;
  const viewer = await getViewer();
  return can(viewer, permission) ? viewer : null;
}

// Lịch thi của học kỳ cho Phòng Khảo thí: xung đột tính trên toàn học kỳ; đề thi chỉ hiện cho người có quyền duyệt đề.
export async function getExamSessions(termId: string) {
  const viewer = await requirePermission("exams.manage");
  if (!isUuid(termId)) return [];
  const canReview = can(viewer, "exams.review");
  return examRows(eq(examSessions.termId, termId), { withConflicts: true, showPapers: (row) => canReview && inScope(viewer, row.faculty) });
}

export async function getExamSession(id: string) {
  const viewer = await requirePermission("exams.manage");
  if (!isUuid(id)) return null;
  const canReview = can(viewer, "exams.review");
  const [exam] = await examRows(eq(examSessions.id, id), { withConflicts: true, showPapers: (row) => canReview && inScope(viewer, row.faculty) });
  return exam ?? null;
}

// Tệp đề thi hoặc đáp án để tải xuống: chỉ giảng viên dạy lớp (người nộp đề) và cán bộ có quyền duyệt đề trong phạm vi khoa.
// Cán bộ tải đề được ghi nhật ký.
export async function getExamPaperFile(examSessionId: string, kind: ExamPaperFileKind) {
  const { user, roles } = await requireSession();
  if (!isUuid(examSessionId)) return null;
  const [row] = await db
    .select({
      kind: examSessions.kind,
      classCode: classSections.code,
      courseName: courses.name,
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
  const file =
    kind === "paper"
      ? { storageKey: row.paperStorageKey, fileName: row.paperFileName, contentType: row.paperContentType }
      : { storageKey: row.answerKeyStorageKey, fileName: row.answerKeyFileName, contentType: row.answerKeyContentType };
  if (!file.storageKey || !file.fileName || !file.contentType) return null;
  if (row.teacherUserId !== user.id) {
    const staff = await examStaff(roles, "exams.review");
    if (!staff || !inScope(staff, row.faculty)) return null;
    await recordAudit(db, {
      actor: auditActorOf(staff),
      action: "export",
      entityType: "exam",
      entityId: examSessionId,
      entityLabel: `${row.classCode} ${row.courseName} (${EXAM_KIND_LABEL[row.kind].toLowerCase()})`,
      summary: `Tải ${kind === "paper" ? "đề thi" : "đáp án"} ${EXAM_KIND_LABEL[row.kind].toLowerCase()} lớp ${row.classCode}`,
    });
  }
  return { storageKey: file.storageKey, fileName: file.fileName, contentType: file.contentType };
}

// Ca thi của lớp giảng viên dạy và ca giảng viên được phân công coi thi. Chỉ chính giảng viên đó xem được; đề nghị đổi ca chỉ
// thấy của chính mình.
export async function getExamsForLecturer(lecturerId: string) {
  const { user } = await requireSession();
  if (!isUuid(lecturerId)) return [];
  const [own] = await db.select({ id: lecturers.id }).from(lecturers).where(and(eq(lecturers.id, lecturerId), eq(lecturers.userId, user.id)));
  if (!own) return [];
  const proctoring = db
    .select({ one: sql`1` })
    .from(examProctors)
    .where(and(eq(examProctors.examSessionId, examSessions.id), eq(examProctors.lecturerId, lecturerId)));
  const rows = await examRows(or(eq(classSections.lecturerId, lecturerId), and(exists(proctoring), ne(examSessions.status, "draft")))!, { showPapers: (row) => row.lecturerId === lecturerId });
  return rows.map((row) => ({ ...row, swapRequests: row.swapRequests.filter((swap) => swap.requesterId === lecturerId || swap.substituteId === lecturerId) }));
}

// Lịch thi theo lớp cho giảng viên dạy lớp hoặc cán bộ quản lý thi trong phạm vi khoa (sinh viên dùng getStudentExams).
export async function getExamsForClassSections(classSectionIds: string[]) {
  const { user, roles } = await requireSession();
  const ids = classSectionIds.filter(isUuid);
  if (ids.length === 0) return [];
  const [ownRows, manager] = await Promise.all([
    db
      .select({ id: classSections.id })
      .from(classSections)
      .innerJoin(teacher, eq(teacher.id, classSections.lecturerId))
      .where(and(inArray(classSections.id, ids), eq(teacher.userId, user.id))),
    examStaff(roles, "exams.manage"),
  ]);
  const own = new Set(ownRows.map((row) => row.id));
  if (own.size === 0 && !manager) return [];
  const rows = await examRows(inArray(examSessions.classSectionId, manager ? ids : [...own]), { showPapers: (row) => own.has(row.lecturerId ?? "") });
  return rows.filter((row) => own.has(row.classSectionId) || (manager !== null && inScope(manager, row.faculty)));
}

// Lịch thi của sinh viên đang đăng nhập: chỉ ca đã công bố (hoặc đã thi) mà sinh viên có tên trong danh sách thi, chỉ trường
// công khai (không cán bộ coi thi, đề thi, đề nghị đổi ca), kèm phòng và số báo danh của chính sinh viên.
export async function getStudentExams(termId: string): Promise<{ exams: StudentExam[]; deferrals: { classSectionId: string; kind: string }[] }> {
  const student = await getCurrentStudent();
  if (!isUuid(termId)) return { exams: [], deferrals: [] };
  const [rows, deferrals] = await Promise.all([
    db
      .select({
        id: examSessions.id,
        kind: examSessions.kind,
        makeupOfKind: original.kind,
        classSectionId: examSessions.classSectionId,
        classCode: classSections.code,
        courseName: courses.name,
        date: examSessions.date,
        startTime: sql<string>`to_char(${examSessions.startTime}, 'HH24:MI')`,
        durationMinutes: examSessions.durationMinutes,
        format: examSessions.format,
        status: examSessions.status,
        room: rooms.code,
        candidateNumber: examCandidates.candidateNumber,
      })
      .from(examCandidates)
      .innerJoin(enrollments, and(eq(enrollments.id, examCandidates.enrollmentId), eq(enrollments.studentId, student.id), eq(enrollments.status, "enrolled")))
      .innerJoin(examSessions, eq(examSessions.id, examCandidates.examSessionId))
      .innerJoin(examSessionRooms, eq(examSessionRooms.id, examCandidates.examRoomId))
      .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
      .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .leftJoin(original, eq(original.id, examSessions.makeupOfId))
      .where(and(eq(examSessions.termId, termId), ne(examSessions.status, "draft")))
      .orderBy(asc(examSessions.date), asc(examSessions.startTime)),
    db
      .select({ classSectionId: enrollments.classSectionId, kind: examDeferrals.kind })
      .from(examDeferrals)
      .innerJoin(enrollments, eq(enrollments.id, examDeferrals.enrollmentId))
      .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, termId))),
  ]);
  return { exams: rows, deferrals };
}

// Danh sách thí sinh của ca theo phòng, số báo danh (để xem, in PDF): Phòng Khảo thí trong phạm vi khoa, giảng viên dạy lớp và
// cán bộ coi thi của ca.
export async function getExamRoster(examSessionId: string): Promise<{ exam: ExamSession; rows: ExamRosterRow[] } | null> {
  const { user, roles } = await requireSession();
  if (!isUuid(examSessionId)) return null;
  const [exam] = await examRows(eq(examSessions.id, examSessionId));
  if (!exam) return null;
  const manager = await examStaff(roles, "exams.manage");
  if (!manager || !inScope(manager, exam.faculty)) {
    const [me] = await db.select({ id: lecturers.id }).from(lecturers).where(eq(lecturers.userId, user.id));
    if (!me || (exam.lecturerId !== me.id && !exam.proctors.some((proctor) => proctor.id === me.id))) return null;
  }
  const rows = await db
    .select({
      enrollmentId: examCandidates.enrollmentId,
      candidateNumber: examCandidates.candidateNumber,
      room: rooms.code,
      studentCode: students.code,
      fullName: students.fullName,
      className: administrativeClasses.code,
    })
    .from(examCandidates)
    .innerJoin(examSessionRooms, eq(examSessionRooms.id, examCandidates.examRoomId))
    .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
    .innerJoin(enrollments, eq(enrollments.id, examCandidates.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .where(eq(examCandidates.examSessionId, examSessionId))
    .orderBy(asc(examCandidates.candidateNumber));
  return { exam, rows: rows.map((row) => ({ ...row, studentCode: formatStudentCode(row.studentCode) })) };
}

// Tổng số tiết kế hoạch, tiết đã học và tiết vắng (gồm vắng có phép) của từng đăng ký. Buổi thực hành chỉ tính cho sinh viên
// của nhóm đó; buổi chưa điểm danh tính vào kế hoạch nhưng chưa tính vắng.
function attendanceTotals(where: SQL) {
  const periods = sql`(${classSessions.endPeriod} - ${classSessions.startPeriod} + 1)`;
  return db
    .select({
      enrollmentId: enrollments.id,
      classSectionId: enrollments.classSectionId,
      studentId: enrollments.studentId,
      planned: sql<number>`coalesce(sum(${periods}), 0)::int`,
      held: sql<number>`coalesce(sum(${periods}) FILTER (WHERE ${classSessions.takenAt} IS NOT NULL), 0)::int`,
      absent: sql<number>`coalesce(sum(${periods}) FILTER (WHERE ${attendanceRecords.enrollmentId} IS NOT NULL), 0)::int`,
      overrideReason: examEligibilityOverrides.reason,
    })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(
      classSessions,
      and(eq(classSessions.classSectionId, enrollments.classSectionId), or(isNull(classSessions.labGroupId), eq(classSessions.labGroupId, enrollments.labGroupId))),
    )
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.classSessionId, classSessions.id),
        eq(attendanceRecords.enrollmentId, enrollments.id),
        isNotNull(classSessions.takenAt),
        inArray(attendanceRecords.status, [...ABSENCE_STATUSES]),
      ),
    )
    .leftJoin(examEligibilityOverrides, and(eq(examEligibilityOverrides.enrollmentId, enrollments.id), isNull(examEligibilityOverrides.revokedAt)))
    .where(and(eq(enrollments.status, "enrolled"), eq(classSections.status, "open"), where))
    .groupBy(enrollments.id, examEligibilityOverrides.reason);
}

// Sinh viên vắng quá ngưỡng quy chế (trên tổng số tiết kế hoạch) trong học kỳ, kèm quyết định cho dự thi còn hiệu lực nếu có.
export async function getExamEligibility(termId: string, limitPercent: number): Promise<ExamEligibilityRow[]> {
  await requirePermission("exams.manage");
  if (!isUuid(termId)) return [];
  const totals = (await attendanceTotals(eq(enrollments.termId, termId))).filter((row) => isBannedFromExam(row.absent, row.planned, limitPercent));
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
        absentPeriods: row.absent,
        plannedPeriods: row.planned,
        ratio: row.absent / row.planned,
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
  return rows.map((row) => ({ classSectionId: row.classSectionId, absentPeriods: row.absent, plannedPeriods: row.planned, heldPeriods: row.held, overrideReason: row.overrideReason }));
}

// Sinh viên được hoãn thi của học kỳ (Phòng Khảo thí), kèm đã có ca thi bù chưa.
export async function getExamDeferrals(termId: string): Promise<ExamDeferralRow[]> {
  await requirePermission("exams.manage");
  if (!isUuid(termId)) return [];
  const rows = await db
    .select({
      id: examDeferrals.id,
      enrollmentId: examDeferrals.enrollmentId,
      classSectionId: enrollments.classSectionId,
      kind: examDeferrals.kind,
      studentCode: students.code,
      fullName: students.fullName,
      sectionCode: classSections.code,
      courseName: courses.name,
      faculty: faculties.name,
      reason: examDeferrals.reason,
      decidedAt: examDeferrals.decidedAt,
      hasMakeup: sql<boolean>`EXISTS (SELECT 1 FROM exam_candidates c JOIN exam_sessions s ON s.id = c.exam_session_id
        JOIN exam_sessions o ON o.id = s.makeup_of_id WHERE c.enrollment_id = ${examDeferrals.enrollmentId} AND o.kind = ${examDeferrals.kind})`,
    })
    .from(examDeferrals)
    .innerJoin(enrollments, eq(enrollments.id, examDeferrals.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(enrollments.termId, termId))
    .orderBy(desc(examDeferrals.decidedAt));
  return rows.map((row) => ({ ...row, studentCode: formatStudentCode(row.studentCode), decidedAt: row.decidedAt.toISOString() }));
}

// Lớp mở của học kỳ để tạo ca thi (kèm đã có ca giữa kỳ, cuối kỳ chưa).
export async function getExamClassOptions(termId: string): Promise<ExamClassOption[]> {
  await requirePermission("exams.manage");
  if (!isUuid(termId)) return [];
  return db
    .select({
      id: classSections.id,
      code: classSections.code,
      courseName: courses.name,
      faculty: faculties.name,
      enrolled: classSections.enrolledCount,
      hasMidterm: sql<boolean>`EXISTS (SELECT 1 FROM exam_sessions s WHERE s.class_section_id = ${classSections.id} AND s.kind = 'midterm')`,
      hasFinal: sql<boolean>`EXISTS (SELECT 1 FROM exam_sessions s WHERE s.class_section_id = ${classSections.id} AND s.kind = 'final')`,
    })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(and(eq(classSections.termId, termId), eq(classSections.status, "open")))
    .orderBy(asc(classSections.code));
}

// Sinh viên đang học lớp (để chọn hoãn thi, thi bù).
export async function getSectionStudents(classSectionId: string) {
  await requirePermission("exams.manage");
  if (!isUuid(classSectionId)) return [];
  const rows = await db
    .select({ enrollmentId: enrollments.id, code: students.code, fullName: students.fullName })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, classSectionId), eq(enrollments.status, "enrolled")))
    .orderBy(asc(students.code));
  return rows.map((row) => ({ ...row, code: formatStudentCode(row.code) }));
}
