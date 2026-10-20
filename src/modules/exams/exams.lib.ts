import "server-only";
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { PERIODS } from "@/shared/constants/period.constant";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { sweepOrphanFiles } from "@/shared/libs/storage.lib";
import { can, inScope } from "@/modules/access/access.constant";
import { roleAssignments, rolePermissions } from "@/modules/access/access.schema";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { ADMIN_EXAMS_HREF, EXAM_KIND_LABEL, EXAM_PAPER_STATUS, EXAM_START_TIMES, LECTURER_EXAMS_HREF, PROCTORS_PER_ROOM, STUDENT_EXAMS_HREF } from "@/modules/exams/exams.constant";
import {
  assignCandidates,
  byVietnameseName,
  examConflicts,
  examStartsAt,
  paperReviewBlockedReason,
  paperSubmitBlockedReason,
  slotsOverlap,
  type ConflictSession,
  type EXAM_GENERATE_SCHEMA,
  type EXAM_SESSION_CREATE_SCHEMA,
  type EXAM_SESSION_UPDATE_SCHEMA,
  type TimeSlot,
} from "@/modules/exams/exams.rule";
import { examCandidates, examDeferrals, examProctors, examProctorSwapRequests, examSessionRooms, examSessions } from "@/modules/exams/exams.schema";
import type { ExamConflict, ExamKind, ExamSession } from "@/modules/exams/exams.type";
import { rooms } from "@/modules/facilities/facilities.schema";
import { notifyLecturers, notifyStudents, notifyUsers } from "@/modules/notifications/notifications.lib";
import { classSessions } from "@/modules/schedule/schedule.schema";
import { lecturers, students } from "@/modules/users/users.schema";

type Executor = Transaction | typeof db;

// Lỗi nghiệp vụ của lịch thi: action đổi thành câu báo, field có thì gắn vào ô của form.
export class ExamInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

// Đã tới giờ thi (giờ Việt Nam) theo giờ của DB.
export const examHasStarted = sql<boolean>`((${examSessions.date} + ${examSessions.startTime}) AT TIME ZONE 'Asia/Ho_Chi_Minh') <= now()`;
const examHasEnded = sql<boolean>`((${examSessions.date} + ${examSessions.startTime}) AT TIME ZONE 'Asia/Ho_Chi_Minh') + make_interval(mins => ${examSessions.durationMinutes}::int) <= now()`;

// Các thao tác ghi lịch thi của một học kỳ chạy lần lượt: kiểm trùng phòng, trùng cán bộ rồi mới ghi, không để hai người lưu
// song song cùng lọt kiểm tra.
export async function lockExamTerm(tx: Transaction, termId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`exam-term:${termId}`}, 0))`);
}

// Tác vụ định kỳ: xóa tệp đề thi, đáp án không còn ca thi nào trỏ tới (bản cũ của lần nộp lại chưa xóa được, tiến trình chết
// giữa lúc ghi tệp và commit).
export async function sweepOrphanExamFiles() {
  const removed = await sweepOrphanFiles("exams", async (keys) => {
    const rows = await db
      .select({ paper: examSessions.paperStorageKey, answerKey: examSessions.answerKeyStorageKey })
      .from(examSessions)
      .where(or(inArray(examSessions.paperStorageKey, keys), inArray(examSessions.answerKeyStorageKey, keys)));
    return new Set(rows.flatMap((row) => [row.paper, row.answerKey]).filter((key) => key !== null));
  });
  return { examFilesRemoved: removed };
}

// Tác vụ định kỳ exam-sessions: ca đã công bố mà đã thi xong (quá giờ kết thúc) chuyển "Đã thi". Chạy lặp lại không đổi gì thêm.
export async function refreshExamStatuses(executor: Executor = db) {
  const rows = await executor
    .update(examSessions)
    .set({ status: "done" })
    .where(and(eq(examSessions.status, "published"), examHasEnded))
    .returning({ id: examSessions.id });
  return { examSessionsDone: rows.length };
}

// Người dùng có quyền duyệt đề (Phòng Khảo thí) để báo đề nghị đổi ca, đề nộp lại.
export async function examOfficeUserIds(executor: Executor) {
  const rows = await executor
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .where(eq(rolePermissions.permission, "exams.review"));
  return rows.map((row) => row.userId);
}

// --- Đọc ca thi trong giao dịch ---

export async function sessionForWrite(tx: Transaction, id: string) {
  const [exam] = await tx
    .select({
      id: examSessions.id,
      termId: examSessions.termId,
      kind: examSessions.kind,
      makeupOfId: examSessions.makeupOfId,
      classSectionId: examSessions.classSectionId,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerId: classSections.lecturerId,
      faculty: faculties.name,
      date: examSessions.date,
      startTime: sql<string>`to_char(${examSessions.startTime}, 'HH24:MI')`,
      durationMinutes: examSessions.durationMinutes,
      format: examSessions.format,
      status: examSessions.status,
      paperStatus: examSessions.paperStatus,
      paperDeadline: examSessions.paperDeadline,
      paperSubmittedAt: examSessions.paperSubmittedAt,
      hasStarted: examHasStarted,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(examSessions.id, id))
    .for("update", { of: examSessions });
  return exam ?? null;
}

export type SessionForWrite = NonNullable<Awaited<ReturnType<typeof sessionForWrite>>>;

export const sessionLabel = (exam: { kind: ExamKind; classCode: string }) => `${EXAM_KIND_LABEL[exam.kind].toLowerCase()} lớp ${exam.classCode}`;

const whenText = (slot: { date: string; startTime: string }) => `${slot.startTime.slice(0, 5)} ngày ${formatDate(slot.date)}`;

// Lịch toàn học kỳ để kiểm xung đột: mọi ca (mọi khoa), phòng, cán bộ coi thi.
export async function termSchedule(executor: Executor, termId: string): Promise<ConflictSession[]> {
  const sessions = await executor
    .select({
      id: examSessions.id,
      classCode: classSections.code,
      date: examSessions.date,
      startTime: sql<string>`to_char(${examSessions.startTime}, 'HH24:MI')`,
      durationMinutes: examSessions.durationMinutes,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .where(eq(examSessions.termId, termId));
  if (sessions.length === 0) return [];
  const ids = sessions.map((session) => session.id);
  const [roomRows, proctorRows] = await Promise.all([
    executor
      .select({ examSessionId: examSessionRooms.examSessionId, roomId: examSessionRooms.roomId, code: rooms.code })
      .from(examSessionRooms)
      .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
      .where(inArray(examSessionRooms.examSessionId, ids)),
    executor
      .select({ examSessionId: examProctors.examSessionId, id: lecturers.id, name: sql<string>`${lecturers.title} || ' ' || ${lecturers.fullName}` })
      .from(examProctors)
      .innerJoin(lecturers, eq(lecturers.id, examProctors.lecturerId))
      .where(inArray(examProctors.examSessionId, ids)),
  ]);
  return sessions.map((session) => {
    const own = roomRows.filter((row) => row.examSessionId === session.id);
    return {
      ...session,
      roomIds: own.map((row) => row.roomId),
      roomCodeOf: Object.fromEntries(own.map((row) => [row.roomId, row.code])),
      proctors: proctorRows.filter((row) => row.examSessionId === session.id).map(({ id, name }) => ({ id, name })),
    };
  });
}

// Số sinh viên chung giữa từng cặp ca của học kỳ (theo danh sách thí sinh đã xếp), khóa "idA:idB".
export async function sharedCandidateCounts(executor: Executor, termId: string) {
  const rows = await executor.execute<{ first: string; second: string; shared: number }>(sql`
    SELECT ca.exam_session_id AS first, cb.exam_session_id AS second, count(DISTINCT ea.student_id)::int AS shared
    FROM exam_candidates ca
    JOIN enrollments ea ON ea.id = ca.enrollment_id
    JOIN exam_sessions sa ON sa.id = ca.exam_session_id AND sa.term_id = ${termId}
    JOIN enrollments eb ON eb.student_id = ea.student_id AND eb.term_id = ${termId}
    JOIN exam_candidates cb ON cb.enrollment_id = eb.id AND cb.exam_session_id <> ca.exam_session_id
    JOIN exam_sessions sb ON sb.id = cb.exam_session_id AND sb.date = sa.date
      AND (sa.date + sa.start_time) < (sb.date + sb.start_time) + make_interval(mins => sb.duration_minutes::int)
      AND (sb.date + sb.start_time) < (sa.date + sa.start_time) + make_interval(mins => sa.duration_minutes::int)
    GROUP BY ca.exam_session_id, cb.exam_session_id`);
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) map.set(row.first, { ...map.get(row.first), [row.second]: row.shared });
  return map;
}

// Giờ dạy của các cán bộ trùng với ca thi: buổi học (có ngày) của lớp họ dạy chồng giờ thi.
export async function teachingClashes(executor: Executor, lecturerIds: string[], slot: TimeSlot) {
  if (lecturerIds.length === 0) return [];
  const rows = await executor
    .select({
      lecturerId: classSections.lecturerId,
      lecturerName: sql<string>`${lecturers.title} || ' ' || ${lecturers.fullName}`,
      classCode: classSections.code,
      startPeriod: classSessions.startPeriod,
      endPeriod: classSessions.endPeriod,
    })
    .from(classSessions)
    .innerJoin(classSections, eq(classSections.id, classSessions.classSectionId))
    .innerJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
    .where(and(eq(classSessions.date, slot.date), inArray(classSections.lecturerId, lecturerIds), ne(classSections.status, "cancelled")));
  return rows.filter((row) => {
    const start = PERIODS.find((period) => period.period === row.startPeriod)?.start;
    const end = PERIODS.find((period) => period.period === row.endPeriod)?.end;
    if (!start || !end) return false;
    const duration = dayjs(`2000-01-01T${end}`).diff(dayjs(`2000-01-01T${start}`), "minute");
    return slotsOverlap(slot, { date: slot.date, startTime: start, durationMinutes: duration });
  });
}

export type SessionDraft = TimeSlot & { id: string; termId: string; classCode: string; roomIds: string[]; proctorIds: string[]; studentIds: string[] };

// Kiểm xung đột của ca sắp lưu với cả học kỳ. Trùng phòng, trùng cán bộ coi thi: chặn. Trùng lịch thi của sinh viên, trùng giờ
// dạy của cán bộ coi thi: chặn trừ khi có lý do (trả lại danh sách để ghi nhật ký).
export async function assertNoConflicts(tx: Transaction, draft: SessionDraft, overrideReason: string | null): Promise<ExamConflict[]> {
  const schedule = (await termSchedule(tx, draft.termId)).filter((session) => session.id !== draft.id);
  const names = await tx
    .select({ id: lecturers.id, name: sql<string>`${lecturers.title} || ' ' || ${lecturers.fullName}` })
    .from(lecturers)
    .where(inArray(lecturers.id, draft.proctorIds.length > 0 ? draft.proctorIds : [draft.id]));
  const roomCodes = draft.roomIds.length > 0 ? await tx.select({ id: rooms.id, code: rooms.code }).from(rooms).where(inArray(rooms.id, draft.roomIds)) : [];
  const overlapping = schedule.filter((session) => slotsOverlap(session, draft));
  const shared: Record<string, number> = {};
  if (draft.studentIds.length > 0 && overlapping.length > 0) {
    const rows = await tx
      .select({ examSessionId: examCandidates.examSessionId, shared: sql<number>`count(DISTINCT ${enrollments.studentId})::int` })
      .from(examCandidates)
      .innerJoin(enrollments, eq(enrollments.id, examCandidates.enrollmentId))
      .where(
        and(
          inArray(
            examCandidates.examSessionId,
            overlapping.map((session) => session.id),
          ),
          inArray(enrollments.studentId, draft.studentIds),
        ),
      )
      .groupBy(examCandidates.examSessionId);
    for (const row of rows) shared[row.examSessionId] = row.shared;
  }
  const conflicts = examConflicts(
    { ...draft, roomCodeOf: Object.fromEntries(roomCodes.map((room) => [room.id, room.code])), proctors: names },
    overlapping,
    shared,
  );
  const clashes = await teachingClashes(tx, draft.proctorIds, draft);
  for (const clash of clashes) conflicts.push({ kind: "teaching", isHard: false, message: `${clash.lecturerName} có giờ dạy lớp ${clash.classCode} trùng giờ thi` });
  const hard = conflicts.filter((conflict) => conflict.isHard);
  if (hard.length > 0) throw new ExamInputError(`Không lưu được: ${hard.map((conflict) => conflict.message).join("; ")}.`, hard[0].kind === "room" ? "rooms" : "rooms");
  const soft = conflicts.filter((conflict) => !conflict.isHard);
  if (soft.length > 0 && !overrideReason) {
    throw new ExamInputError(`${soft.map((conflict) => conflict.message).join("; ")}. Đổi giờ, đổi cán bộ hoặc ghi lý do để vẫn lưu.`, "overrideReason");
  }
  return soft;
}

// --- Thí sinh ---

// Sinh viên dự thi của ca: giữa kỳ, cuối kỳ là sinh viên đang học lớp trừ người được hoãn kỳ thi đó; ca thi bù là danh sách đã chọn.
export async function expectedCandidates(tx: Executor, exam: { id: string | null; kind: ExamKind; classSectionId: string }, makeupEnrollmentIds?: string[]) {
  const base = tx
    .select({ enrollmentId: enrollments.id, studentId: enrollments.studentId, fullName: students.fullName, code: students.code })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId));
  if (exam.kind === "makeup") {
    const ids = makeupEnrollmentIds ?? (exam.id ? (await tx.select({ id: examCandidates.enrollmentId }).from(examCandidates).where(eq(examCandidates.examSessionId, exam.id))).map((row) => row.id) : []);
    if (ids.length === 0) return [];
    return (await base.where(and(inArray(enrollments.id, ids), eq(enrollments.classSectionId, exam.classSectionId), eq(enrollments.status, "enrolled")))).toSorted(byVietnameseName);
  }
  const deferred = tx.select({ id: examDeferrals.enrollmentId }).from(examDeferrals).where(eq(examDeferrals.kind, exam.kind));
  const rows = await base.where(and(eq(enrollments.classSectionId, exam.classSectionId), eq(enrollments.status, "enrolled"), notInArray(enrollments.id, deferred)));
  return rows.toSorted(byVietnameseName);
}

// Xếp lại thí sinh vào các phòng của ca theo sức chứa thi và đánh số báo danh. Thiếu chỗ thì báo lỗi (không lưu).
export async function syncCandidates(tx: Transaction, exam: { id: string; kind: ExamKind; classSectionId: string }, makeupEnrollmentIds?: string[]) {
  const list = await expectedCandidates(tx, exam, makeupEnrollmentIds);
  const roomRows = await tx
    .select({ id: examSessionRooms.id, examCapacity: rooms.examCapacity })
    .from(examSessionRooms)
    .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
    .where(eq(examSessionRooms.examSessionId, exam.id))
    .orderBy(asc(examSessionRooms.position));
  const plan = assignCandidates(list, roomRows);
  if (!plan.ok) throw new ExamInputError(`Các phòng đã chọn chỉ đủ ${plan.capacity} chỗ ngồi thi cho ${list.length} thí sinh, thêm phòng cho ${plan.shortfall} thí sinh còn lại.`, "rooms");
  await tx.delete(examCandidates).where(eq(examCandidates.examSessionId, exam.id));
  if (plan.assigned.length > 0) {
    await tx.insert(examCandidates).values(
      plan.assigned.map((entry) => ({ examSessionId: exam.id, enrollmentId: entry.candidate.enrollmentId, examRoomId: entry.roomId, candidateNumber: entry.candidateNumber })),
    );
  }
  return list;
}

// Ghi lại phòng và cán bộ coi thi của ca (thay toàn bộ). Người bị gỡ khỏi ca: đề nghị đổi ca đang chờ của họ hết hiệu lực,
// vẫn giữ làm lịch sử.
export async function replaceSessionRooms(tx: Transaction, examSessionId: string, plan: { roomId: string; proctorIds: string[] }[]) {
  const before = await tx.select({ lecturerId: examProctors.lecturerId }).from(examProctors).where(eq(examProctors.examSessionId, examSessionId));
  await tx.delete(examSessionRooms).where(eq(examSessionRooms.examSessionId, examSessionId));
  if (plan.length > 0) {
    const inserted = await tx
      .insert(examSessionRooms)
      .values(plan.map((room, index) => ({ examSessionId, roomId: room.roomId, position: index + 1 })))
      .returning({ id: examSessionRooms.id, roomId: examSessionRooms.roomId });
    const idOf = new Map(inserted.map((row) => [row.roomId, row.id]));
    const proctors = plan.flatMap((room) => room.proctorIds.map((lecturerId) => ({ examSessionId, lecturerId, examRoomId: idOf.get(room.roomId)! })));
    if (proctors.length > 0) await tx.insert(examProctors).values(proctors);
  }
  const after = new Set(plan.flatMap((room) => room.proctorIds));
  const removed = before.map((row) => row.lecturerId).filter((id) => !after.has(id));
  const added = [...after].filter((id) => !before.some((row) => row.lecturerId === id));
  if (removed.length > 0) {
    await tx
      .update(examProctorSwapRequests)
      .set({ decision: "withdrawn", resolvedAt: sql`now()`, resolveNote: "Phòng Khảo thí đã đổi phân công coi thi" })
      .where(and(eq(examProctorSwapRequests.examSessionId, examSessionId), inArray(examProctorSwapRequests.requesterId, removed), isNull(examProctorSwapRequests.resolvedAt)));
  }
  return { removed, added, all: [...after] };
}

// Phòng thi hợp lệ: còn trong danh mục, không bảo trì.
export async function assertRoomsUsable(tx: Transaction, roomIds: string[]) {
  if (roomIds.length === 0) return;
  const rows = await tx.select({ id: rooms.id, code: rooms.code, status: rooms.status }).from(rooms).where(inArray(rooms.id, roomIds));
  if (rows.length !== roomIds.length) throw new ExamInputError("Có phòng không còn trong danh mục, tải lại trang.", "rooms");
  const closed = rows.filter((row) => row.status !== "active");
  if (closed.length > 0) throw new ExamInputError(`Phòng ${closed.map((row) => row.code).join(", ")} đang bảo trì, chọn phòng khác.`, "rooms");
}

export async function assertProctorsActive(tx: Transaction, lecturerIds: string[]) {
  if (lecturerIds.length === 0) return;
  const people = await tx.select({ id: lecturers.id }).from(lecturers).where(and(inArray(lecturers.id, lecturerIds), eq(lecturers.status, "active")));
  if (people.length !== lecturerIds.length) throw new ExamInputError("Có cán bộ coi thi không còn công tác.", "rooms");
}

// Báo một thay đổi của ca tới sinh viên dự thi, giảng viên dạy lớp và cán bộ coi thi (chỉ khi ca đã công bố).
export async function notifyExamPeople(
  tx: Transaction,
  exam: { id: string; lecturerId: string | null },
  message: { title: string; studentBody: string; staffBody: string },
  extraLecturerIds: string[] = [],
) {
  const [candidates, proctors] = await Promise.all([
    tx
      .select({ studentId: enrollments.studentId })
      .from(examCandidates)
      .innerJoin(enrollments, eq(enrollments.id, examCandidates.enrollmentId))
      .where(eq(examCandidates.examSessionId, exam.id)),
    tx.select({ id: examProctors.lecturerId }).from(examProctors).where(eq(examProctors.examSessionId, exam.id)),
  ]);
  const notifiedStudents = await notifyStudents(
    tx,
    candidates.map((row) => row.studentId),
    { kind: "exam", title: message.title, body: message.studentBody, href: STUDENT_EXAMS_HREF },
  );
  const staff = [...new Set([...(exam.lecturerId ? [exam.lecturerId] : []), ...proctors.map((row) => row.id), ...extraLecturerIds])];
  const notifiedStaff = await notifyLecturers(tx, staff, { kind: "exam", title: message.title, body: message.staffBody, href: LECTURER_EXAMS_HREF });
  return { students: notifiedStudents.length, lecturers: notifiedStaff.length };
}

export const describeSlot = (exam: { date: string; startTime: string; durationMinutes: number }, roomCodes: string[]) =>
  `${whenText(exam)}, ${exam.durationMinutes} phút${roomCodes.length > 0 ? `, phòng ${roomCodes.join(", ")}` : ""}`;

export async function roomCodesOf(executor: Executor, examSessionId: string) {
  const rows = await executor
    .select({ code: rooms.code })
    .from(examSessionRooms)
    .innerJoin(rooms, eq(rooms.id, examSessionRooms.roomId))
    .where(eq(examSessionRooms.examSessionId, examSessionId))
    .orderBy(asc(examSessionRooms.position));
  return rows.map((row) => row.code);
}

// --- Đề thi ---

export type PaperUpload = { key: string; name: string; contentType: string; data: Uint8Array };

// Ghi lần nộp đề (tệp đã nằm trong kho) cho ca thi của lớp giảng viên dạy: chưa tới giờ thi, đề chưa duyệt, chưa quá hạn (đề
// bị trả lại thì nộp lại được tới giờ thi). Nộp lại thì xóa kết quả xét lần trước. Trả khóa tệp cũ để xóa sau khi commit.
export async function recordPaperSubmission(tx: Transaction, lecturerId: string, examSessionId: string, files: { paper: PaperUpload; answerKey: PaperUpload }) {
  const { paper, answerKey } = files;
  const [current] = await tx
    .select({
      kind: examSessions.kind,
      classCode: classSections.code,
      status: examSessions.status,
      paperStatus: examSessions.paperStatus,
      paperDeadline: examSessions.paperDeadline,
      hasStarted: examHasStarted,
      paperStorageKey: examSessions.paperStorageKey,
      answerKeyStorageKey: examSessions.answerKeyStorageKey,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .where(and(eq(examSessions.id, examSessionId), eq(classSections.lecturerId, lecturerId)))
    .for("update", { of: examSessions });
  if (!current) throw new ExamInputError("Không nộp được: ca thi không thuộc lớp bạn dạy. Tải lại trang để xem trạng thái mới.");
  const blocked = paperSubmitBlockedReason({ ...current, paperDeadline: current.paperDeadline.toISOString() });
  if (blocked) throw new ExamInputError(`Không nộp được: ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)} Tải lại trang để xem trạng thái mới.`);
  const [row] = await tx
    .update(examSessions)
    .set({
      paperStatus: "submitted",
      paperStorageKey: paper.key,
      paperFileName: paper.name,
      paperContentType: paper.contentType,
      paperSizeBytes: paper.data.byteLength,
      answerKeyStorageKey: answerKey.key,
      answerKeyFileName: answerKey.name,
      answerKeyContentType: answerKey.contentType,
      answerKeySizeBytes: answerKey.data.byteLength,
      // clock_timestamp: hai lần nộp trong cùng giao dịch (test) vẫn khác phiên bản.
      paperSubmittedAt: sql`clock_timestamp()`,
      paperReviewedByUserId: null,
      paperReviewedAt: null,
      paperReturnReason: null,
    })
    .where(eq(examSessions.id, examSessionId))
    .returning({ id: examSessions.id, paperStatus: examSessions.paperStatus, paperSubmittedAt: examSessions.paperSubmittedAt });
  // Nộp lại sau khi bị trả lại: báo Phòng Khảo thí xét lại.
  if (current.paperStatus === "returned") {
    await notifyUsers(tx, await examOfficeUserIds(tx), "administrator", {
      kind: "exam",
      title: `Đề thi ${sessionLabel(current)} đã nộp lại`,
      body: "Giảng viên đã sửa và nộp lại đề bị trả lại, cần xét lại.",
      href: ADMIN_EXAMS_HREF,
    });
  }
  return { row, replaced: [current.paperStorageKey, current.answerKeyStorageKey].filter((key) => key !== null) };
}

export type PaperDecision = { decision: "approve"; paperSubmittedAt: string } | { decision: "return"; reason: string; paperSubmittedAt?: string };

// Phòng Khảo thí (quyền exams.review, đúng phạm vi khoa) xét đề đang chờ duyệt: duyệt thì khóa đề, trả lại thì giảng viên thấy
// lý do và nộp lại. Duyệt phải đúng bản người duyệt đã mở (thời điểm nộp): giảng viên vừa thay đề thì từ chối.
export async function decidePaperReview(tx: Transaction, viewer: Viewer, examSessionId: string, decision: PaperDecision) {
  if (!can(viewer, "exams.review")) throw new ExamInputError("Vai trò hiện tại không có quyền duyệt đề thi.");
  const exam = await sessionForWrite(tx, examSessionId);
  if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
  const blocked = paperReviewBlockedReason(exam);
  if (blocked) throw new ExamInputError(`${blocked} Tải lại trang để xem trạng thái mới.`);
  if (decision.paperSubmittedAt !== undefined && exam.paperSubmittedAt?.getTime() !== new Date(decision.paperSubmittedAt).getTime()) {
    throw new ExamInputError("Giảng viên vừa nộp bản đề mới sau khi bạn mở. Tải lại trang và xem bản mới trước khi xét.");
  }
  const next = decision.decision === "approve" ? "approved" : "returned";
  await tx
    .update(examSessions)
    .set({
      paperStatus: next,
      paperReviewedByUserId: viewer.id,
      paperReviewedAt: sql`now()`,
      paperReturnReason: decision.decision === "return" ? decision.reason : null,
    })
    .where(eq(examSessions.id, examSessionId));
  const label = sessionLabel(exam);
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: decision.decision === "approve" ? "approve" : "reject",
    entityType: "exam",
    entityId: examSessionId,
    entityLabel: `${exam.classCode} ${exam.courseName} (${EXAM_KIND_LABEL[exam.kind].toLowerCase()})`,
    summary: decision.decision === "approve" ? `Duyệt đề thi ${label}` : `Trả lại đề thi ${label}: ${decision.reason}`,
    changes: [{ field: "Trạng thái đề", before: EXAM_PAPER_STATUS[exam.paperStatus].label, after: EXAM_PAPER_STATUS[next].label }],
  });
  if (exam.lecturerId) {
    await notifyLecturers(
      tx,
      [exam.lecturerId],
      decision.decision === "approve"
        ? { kind: "exam", title: `Đề thi ${label} đã được duyệt`, body: `Phòng Khảo thí đã duyệt đề ${exam.courseName}. Đề đã khóa, không nộp lại được.`, href: LECTURER_EXAMS_HREF }
        : { kind: "exam", title: `Đề thi ${label} bị trả lại`, body: `Lý do: ${decision.reason.replace(/[.\s]+$/, "")}. Sửa đề và nộp lại trước giờ thi.`, href: LECTURER_EXAMS_HREF },
    );
  }
  return next;
}

// Mở khóa đề đã duyệt khi phát hiện lỗi (quyền exams.review): đề chuyển "bị trả lại" kèm lý do, giữ tệp để giảng viên xem lại.
export async function unlockApprovedPaper(tx: Transaction, viewer: Viewer, examSessionId: string, reason: string) {
  if (!can(viewer, "exams.review")) throw new ExamInputError("Vai trò hiện tại không có quyền mở khóa đề thi.");
  const exam = await sessionForWrite(tx, examSessionId);
  if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
  if (exam.hasStarted || exam.status === "done") throw new ExamInputError("Ca thi đã diễn ra, không mở khóa đề được nữa.");
  if (exam.paperStatus !== "approved") throw new ExamInputError("Đề chưa được duyệt nên không cần mở khóa. Tải lại trang.");
  await tx
    .update(examSessions)
    .set({ paperStatus: "returned", paperReviewedByUserId: viewer.id, paperReviewedAt: sql`now()`, paperReturnReason: reason })
    .where(eq(examSessions.id, examSessionId));
  const label = sessionLabel(exam);
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "update",
    entityType: "exam",
    entityId: examSessionId,
    entityLabel: `${exam.classCode} ${exam.courseName} (${EXAM_KIND_LABEL[exam.kind].toLowerCase()})`,
    summary: `Mở khóa đề thi đã duyệt ${label}: ${reason}`,
    changes: [{ field: "Trạng thái đề", before: EXAM_PAPER_STATUS.approved.label, after: EXAM_PAPER_STATUS.returned.label }],
  });
  if (exam.lecturerId) {
    await notifyLecturers(tx, [exam.lecturerId], {
      kind: "exam",
      title: `Đề thi ${label} được mở khóa để sửa`,
      body: `Phòng Khảo thí phát hiện lỗi ở đề đã duyệt: ${reason.replace(/[.\s]+$/, "")}. Sửa đề và nộp lại trước giờ thi.`,
      href: LECTURER_EXAMS_HREF,
    });
  }
}

// --- Đổi ca coi thi ---

// Phòng Khảo thí chấp nhận (người coi thay vào đúng phòng của người gửi) hoặc từ chối đề nghị đổi ca. Kiểm người thay cùng khoa
// với người gửi, không trùng ca thi khác và giờ dạy; báo người gửi, người thay.
export async function decideProctorSwap(tx: Transaction, viewer: Viewer, id: string, decision: "accepted" | "rejected", note: string | null) {
  const [swap] = await tx.select().from(examProctorSwapRequests).where(eq(examProctorSwapRequests.id, id)).for("update");
  if (!swap) throw new ExamInputError("Đề nghị không còn, tải lại trang.");
  if (swap.resolvedAt) throw new ExamInputError("Đề nghị đã được xử lý trước đó, tải lại trang.");
  const exam = await sessionForWrite(tx, swap.examSessionId);
  if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi ngoài phạm vi khoa của bạn.");
  if (exam.hasStarted || exam.status === "done") throw new ExamInputError("Ca thi đã diễn ra, không đổi ca được nữa.");
  await lockExamTerm(tx, exam.termId);
  const people = await tx
    .select({ id: lecturers.id, facultyId: lecturers.facultyId, status: lecturers.status, name: sql<string>`${lecturers.title} || ' ' || ${lecturers.fullName}` })
    .from(lecturers)
    .where(inArray(lecturers.id, [swap.requesterId, swap.substituteId]));
  const requester = people.find((person) => person.id === swap.requesterId)!;
  const substitute = people.find((person) => person.id === swap.substituteId)!;
  if (decision === "accepted") {
    if (substitute.status !== "active") throw new ExamInputError("Người coi thay không còn công tác, hãy từ chối đề nghị.");
    if (substitute.facultyId !== requester.facultyId) throw new ExamInputError("Người coi thay không cùng khoa với người gửi.");
    const [assignment] = await tx
      .select({ examRoomId: examProctors.examRoomId })
      .from(examProctors)
      .where(and(eq(examProctors.examSessionId, exam.id), eq(examProctors.lecturerId, requester.id)));
    if (!assignment) throw new ExamInputError("Người gửi không còn coi ca này.");
    const [already] = await tx
      .select({ id: examProctors.lecturerId })
      .from(examProctors)
      .where(and(eq(examProctors.examSessionId, exam.id), eq(examProctors.lecturerId, substitute.id)));
    if (already) throw new ExamInputError("Người coi thay đã coi cùng ca thi.");
    const busy = (await termSchedule(tx, exam.termId)).filter((session) => session.id !== exam.id && slotsOverlap(session, exam) && session.proctors.some((proctor) => proctor.id === substitute.id));
    if (busy.length > 0) throw new ExamInputError(`${substitute.name} đã coi ca ${busy[0].classCode} trùng giờ.`);
    const teaching = await teachingClashes(tx, [substitute.id], exam);
    if (teaching.length > 0) throw new ExamInputError(`${substitute.name} có giờ dạy lớp ${teaching[0].classCode} trùng giờ thi.`);
    await tx.update(examProctors).set({ lecturerId: substitute.id }).where(and(eq(examProctors.examSessionId, exam.id), eq(examProctors.lecturerId, requester.id)));
  }
  await tx.update(examProctorSwapRequests).set({ decision, resolvedAt: sql`now()`, resolvedByUserId: viewer.id, resolveNote: note }).where(eq(examProctorSwapRequests.id, id));
  const label = sessionLabel(exam);
  const when = whenText(exam);
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: decision === "accepted" ? "approve" : "reject",
    entityType: "exam",
    entityId: exam.id,
    entityLabel: `${exam.classCode} ${exam.courseName} (${EXAM_KIND_LABEL[exam.kind].toLowerCase()})`,
    summary: decision === "accepted" ? `Đổi cán bộ coi thi ${label}: ${requester.name} → ${substitute.name}` : `Không đồng ý đổi ca coi thi ${label} của ${requester.name}${note ? `: ${note}` : ""}`,
  });
  await notifyLecturers(tx, [requester.id], {
    kind: "exam",
    title: decision === "accepted" ? `Đã đổi ca coi thi ${label}` : `Đề nghị đổi ca coi thi ${label} không được chấp nhận`,
    body: decision === "accepted" ? `${substitute.name} coi thay bạn lúc ${when}.` : `Bạn vẫn coi thi lúc ${when}.${note ? ` Ghi chú: ${note}` : ""}`,
    href: LECTURER_EXAMS_HREF,
  });
  if (decision === "accepted") {
    await notifyLecturers(tx, [substitute.id], { kind: "exam", title: `Bạn được phân công coi thi ${label}`, body: `Coi thay ${requester.name} lúc ${when}.`, href: LECTURER_EXAMS_HREF });
  }
  return decision;
}

// Lớp mở của học kỳ chưa có ca cuối kỳ, để sinh hàng loạt.
export async function sectionsWithoutFinal(tx: Executor, termId: string) {
  const hasFinal = tx
    .select({ id: examSessions.classSectionId })
    .from(examSessions)
    .where(and(eq(examSessions.termId, termId), eq(examSessions.kind, "final")));
  return tx
    .select({ id: classSections.id, code: classSections.code, courseName: courses.name, lecturerId: classSections.lecturerId, facultyId: courses.facultyId, faculty: faculties.name, enrolled: classSections.enrolledCount })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(and(eq(classSections.termId, termId), eq(classSections.status, "open"), notInArray(classSections.id, hasFinal)))
    .orderBy(asc(classSections.enrolledCount));
}

// Ca thi đã qua giờ bắt đầu (dùng ở các chốt chặn ngoài ca đang khóa).
export function hasStartedAt(exam: { date: string; startTime: string }, now = dayjs()) {
  return !examStartsAt(exam.date, exam.startTime).isAfter(now);
}

// --- Xếp lịch (dùng chung cho server action và test) ---

export const entityLabel = (exam: { classCode: string; courseName: string; kind: SessionForWrite["kind"] }) => `${exam.classCode} ${exam.courseName} (${EXAM_KIND_LABEL[exam.kind].toLowerCase()})`;

// Lớp học phần trong phạm vi khoa của người thao tác, thuộc học kỳ; khóa lịch học kỳ để kiểm xung đột không chen nhau.
export async function sectionInScope(tx: Transaction, viewer: Viewer, classSectionId: string) {
  const [section] = await tx
    .select({
      id: classSections.id,
      termId: classSections.termId,
      code: classSections.code,
      courseName: courses.name,
      status: classSections.status,
      lecturerId: classSections.lecturerId,
      faculty: faculties.name,
      termStart: terms.startDate,
      termEnd: terms.endDate,
    })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .where(eq(classSections.id, classSectionId));
  if (!section || !inScope(viewer, section.faculty)) throw new ExamInputError("Lớp học phần không còn hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
  return section;
}

// Ngày thi trong học kỳ (thi cuối kỳ được tới 3 tuần sau ngày kết thúc học kỳ), chưa qua, không chủ nhật (schema đã kiểm).
export function assertDateAllowed(date: string, startTime: string, term: { termStart: string; termEnd: string }) {
  if (date < term.termStart || date > dayjs(term.termEnd).add(21, "day").format("YYYY-MM-DD")) throw new ExamInputError("Ngày thi phải nằm trong học kỳ (hoặc 3 tuần thi sau học kỳ).", "date");
  if (!examStartsAt(date, startTime).isAfter(dayjs())) throw new ExamInputError("Giờ thi đã qua, chọn ngày giờ khác.", "date");
}

export type SlotValues = { date: string; startTime: string; durationMinutes: number; format: ExamSession["format"]; paperDeadline: string; rooms: { roomId: string; proctorIds: string[] }[]; overrideReason: string | null };

// Ghi phòng, cán bộ coi thi, xếp lại thí sinh và kiểm xung đột cho ca vừa tạo hoặc vừa sửa (trong cùng giao dịch).
async function applySlot(tx: Transaction, exam: { id: string; termId: string; kind: SessionForWrite["kind"]; classSectionId: string; classCode: string }, values: SlotValues, makeupEnrollmentIds?: string[]) {
  const proctorIds = values.rooms.flatMap((room) => room.proctorIds);
  await assertRoomsUsable(
    tx,
    values.rooms.map((room) => room.roomId),
  );
  await assertProctorsActive(tx, proctorIds);
  const changes = await replaceSessionRooms(tx, exam.id, values.rooms);
  const candidates = await syncCandidates(tx, exam, makeupEnrollmentIds);
  const soft = await assertNoConflicts(
    tx,
    {
      id: exam.id,
      termId: exam.termId,
      classCode: exam.classCode,
      date: values.date,
      startTime: values.startTime,
      durationMinutes: values.durationMinutes,
      roomIds: values.rooms.map((room) => room.roomId),
      proctorIds,
      studentIds: candidates.map((candidate) => candidate.studentId),
    },
    values.overrideReason,
  );
  return { soft, changes };
}

const softSummary = (soft: ExamConflict[], reason: string | null) => (soft.length > 0 ? ` Bỏ qua cảnh báo (${soft.map((conflict) => conflict.message).join("; ")}): ${reason}.` : "");


// Tạo một ca thi (đã kiểm dữ liệu vào): giữa kỳ, cuối kỳ cho cả lớp, hoặc ca thi bù cho danh sách sinh viên của một ca gốc.
export async function createSession(tx: Transaction, viewer: Viewer, input: z.output<typeof EXAM_SESSION_CREATE_SCHEMA>) {
  const { classSectionId, kind, makeupOfId, makeupEnrollmentIds, ...values } = input;
  const section = await sectionInScope(tx, viewer, classSectionId);
  if (section.status !== "open") throw new ExamInputError("Lớp học phần không mở nên không xếp lịch thi.");
  await lockExamTerm(tx, section.termId);
  assertDateAllowed(values.date, values.startTime, section);
  if (kind === "makeup") {
    const [base] = await tx
      .select({ kind: examSessions.kind })
      .from(examSessions)
      .where(and(eq(examSessions.id, makeupOfId!), eq(examSessions.classSectionId, classSectionId)));
    if (!base || base.kind === "makeup") throw new ExamInputError("Ca gốc phải là ca giữa kỳ hoặc cuối kỳ của lớp này.", "makeupOfId");
  }
  const [row] = await tx
    .insert(examSessions)
    .values({
      termId: section.termId,
      classSectionId,
      kind,
      makeupOfId: kind === "makeup" ? makeupOfId! : null,
      format: values.format,
      date: values.date,
      startTime: values.startTime,
      durationMinutes: values.durationMinutes,
      paperDeadline: new Date(values.paperDeadline),
    })
    .returning({ id: examSessions.id });
  const { soft } = await applySlot(tx, { id: row.id, termId: section.termId, kind, classSectionId, classCode: section.code }, values, kind === "makeup" ? makeupEnrollmentIds : undefined);
  const roomCodes = await roomCodesOf(tx, row.id);
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "create",
    entityType: "exam",
    entityId: row.id,
    entityLabel: entityLabel({ classCode: section.code, courseName: section.courseName, kind }),
    summary: `Tạo ca thi ${sessionLabel({ kind, classCode: section.code })}: ${describeSlot(values, roomCodes)}.${softSummary(soft, values.overrideReason)}`,
  });
  return row.id;
}

// Sửa ca chưa thi; ca đã công bố thì báo sinh viên, giảng viên, cán bộ coi thi (cả người bị gỡ).
export async function updateSession(tx: Transaction, viewer: Viewer, input: z.output<typeof EXAM_SESSION_UPDATE_SCHEMA>) {
  const { id, ...values } = input;
  const exam = await sessionForWrite(tx, id);
  if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
  if (exam.status === "done" || exam.hasStarted) throw new ExamInputError("Ca thi đã diễn ra, không sửa được nữa.");
  await lockExamTerm(tx, exam.termId);
  const section = await sectionInScope(tx, viewer, exam.classSectionId);
  const isMoved = values.date !== exam.date || values.startTime !== exam.startTime;
  if (isMoved) assertDateAllowed(values.date, values.startTime, section);
  const roomsBefore = await roomCodesOf(tx, id);
  await tx
    .update(examSessions)
    .set({ date: values.date, startTime: values.startTime, durationMinutes: values.durationMinutes, format: values.format, paperDeadline: new Date(values.paperDeadline) })
    .where(eq(examSessions.id, id));
  const { soft, changes } = await applySlot(tx, exam, values);
  const roomsAfter = await roomCodesOf(tx, id);
  const before = describeSlot(exam, roomsBefore);
  const after = describeSlot(values, roomsAfter);
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "update",
    entityType: "exam",
    entityId: id,
    entityLabel: entityLabel(exam),
    summary: `Sửa ca thi ${sessionLabel(exam)}.${softSummary(soft, values.overrideReason)}`,
    changes: [
      ...(before !== after ? [{ field: "Lịch thi", before, after }] : []),
      ...(exam.paperDeadline.getTime() !== new Date(values.paperDeadline).getTime()
        ? [{ field: "Hạn nộp đề", before: exam.paperDeadline.toISOString(), after: values.paperDeadline }]
        : []),
      ...(changes.removed.length + changes.added.length > 0 ? [{ field: "Cán bộ coi thi", before: `${changes.removed.length} người bị gỡ`, after: `${changes.added.length} người mới` }] : []),
    ],
  });
  if (exam.status === "published" && (before !== after || changes.removed.length + changes.added.length > 0)) {
    await notifyExamPeople(
      tx,
      exam,
      {
        title: `Lịch thi ${sessionLabel(exam)} thay đổi`,
        studentBody: `${exam.courseName}: ${after}. Xem phòng và số báo danh ở trang Lịch thi.`,
        staffBody: `${exam.courseName}: ${after} (trước đây ${before}).`,
      },
      changes.removed,
    );
  }
}

// Sinh hàng loạt ca cuối kỳ dự kiến cho lớp mở chưa có ca.
export async function generateFinals(tx: Transaction, viewer: Viewer, input: z.output<typeof EXAM_GENERATE_SCHEMA>) {
  const { termId, fromDate, toDate, durationMinutes, paperDaysBefore } = input;
  await lockExamTerm(tx, termId);
  const [term] = await tx.select({ id: terms.id }).from(terms).where(eq(terms.id, termId));
  if (!term) throw new ExamInputError("Học kỳ không còn, tải lại trang.");
  const sections = (await sectionsWithoutFinal(tx, termId)).filter((section) => inScope(viewer, section.faculty)).toReversed();
  if (sections.length === 0) throw new ExamInputError("Mọi lớp mở trong phạm vi của bạn đã có ca cuối kỳ.");
  const slots: { date: string; startTime: string }[] = [];
  for (let day = dayjs(fromDate); !day.isAfter(dayjs(toDate)); day = day.add(1, "day")) {
    if (day.day() === 0) continue;
    for (const startTime of EXAM_START_TIMES) if (examStartsAt(day.format("YYYY-MM-DD"), startTime).isAfter(dayjs().add(1, "day"))) slots.push({ date: day.format("YYYY-MM-DD"), startTime });
  }
  if (slots.length === 0) throw new ExamInputError("Khoảng ngày đã chọn không còn giờ thi nào (từ ngày mai, trừ chủ nhật).", "fromDate");
  const roomList = (await tx.select({ id: rooms.id, code: rooms.code, examCapacity: rooms.examCapacity, status: rooms.status }).from(rooms))
    .filter((room) => room.status === "active")
    .toSorted((a, b) => b.examCapacity - a.examCapacity);
  const staff = await tx.select({ id: lecturers.id, facultyId: lecturers.facultyId, status: lecturers.status }).from(lecturers).orderBy(asc(lecturers.code));
  const schedule = await termSchedule(tx, termId);
  // Sinh viên theo ca đã có, để không xếp trùng giờ thi của sinh viên.
  const studentRows = await tx
    .select({ examSessionId: examCandidates.examSessionId, studentId: enrollments.studentId })
    .from(examCandidates)
    .innerJoin(enrollments, eq(enrollments.id, examCandidates.enrollmentId))
    .innerJoin(examSessions, and(eq(examSessions.id, examCandidates.examSessionId), eq(examSessions.termId, termId)));
  const studentsOf = new Map<string, Set<string>>();
  for (const row of studentRows) studentsOf.set(row.examSessionId, (studentsOf.get(row.examSessionId) ?? new Set()).add(row.studentId));
  const busy = schedule.map((session) => ({ ...session, studentIds: studentsOf.get(session.id) ?? new Set<string>() }));
  const load = new Map<string, number>();
  const skipped: string[] = [];
  let created = 0;
  for (const section of sections) {
    const candidates = await expectedCandidates(tx, { id: null, kind: "final", classSectionId: section.id });
    const studentIds = new Set(candidates.map((candidate) => candidate.studentId));
    let placed = false;
    for (const slot of slots) {
      const at = { ...slot, durationMinutes };
      const overlapping = busy.filter((session) => slotsOverlap(session, at));
      if (overlapping.some((session) => [...session.studentIds].some((id) => studentIds.has(id)))) continue;
      const takenRooms = new Set(overlapping.flatMap((session) => session.roomIds));
      const free = roomList.filter((room) => !takenRooms.has(room.id));
      const chosen: typeof free = [];
      for (const room of free) {
        if (chosen.reduce((sum, entry) => sum + entry.examCapacity, 0) >= candidates.length) break;
        chosen.push(room);
      }
      if (chosen.length === 0 || chosen.reduce((sum, entry) => sum + entry.examCapacity, 0) < candidates.length) continue;
      const takenPeople = new Set(overlapping.flatMap((session) => session.proctors.map((proctor) => proctor.id)));
      const pool = staff.filter((person) => person.status === "active" && person.facultyId === section.facultyId && person.id !== section.lecturerId && !takenPeople.has(person.id));
      const teaching = new Set((await teachingClashes(tx, pool.map((person) => person.id), at)).map((clash) => clash.lecturerId));
      const available = pool.filter((person) => !teaching.has(person.id)).toSorted((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
      const needed = chosen.length * PROCTORS_PER_ROOM;
      if (available.length < needed) continue;
      const picked = available.slice(0, needed);
      const plan = chosen.map((room, index) => ({ roomId: room.id, proctorIds: picked.slice(index * PROCTORS_PER_ROOM, (index + 1) * PROCTORS_PER_ROOM).map((person) => person.id) }));
      const deadline = examStartsAt(slot.date, slot.startTime).subtract(paperDaysBefore, "day").hour(17).minute(0);
      const [row] = await tx
        .insert(examSessions)
        .values({
          termId,
          classSectionId: section.id,
          kind: "final",
          format: "written",
          date: slot.date,
          startTime: slot.startTime,
          durationMinutes,
          paperDeadline: (deadline.isAfter(dayjs()) ? deadline : dayjs().add(1, "hour")).toDate(),
        })
        .returning({ id: examSessions.id });
      await replaceSessionRooms(tx, row.id, plan);
      await syncCandidates(tx, { id: row.id, kind: "final", classSectionId: section.id });
      for (const person of picked) load.set(person.id, (load.get(person.id) ?? 0) + 1);
      busy.push({ id: row.id, classCode: section.code, ...at, roomIds: chosen.map((room) => room.id), proctors: picked.map((person) => ({ id: person.id, name: "" })), studentIds });
      created += 1;
      placed = true;
      break;
    }
    if (!placed) skipped.push(section.code);
  }
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "create",
    entityType: "exam",
    entityId: termId,
    entityLabel: "Lịch thi cuối kỳ",
    summary: `Sinh ${created} ca thi cuối kỳ dự kiến từ ${formatDate(fromDate)} đến ${formatDate(toDate)}${skipped.length > 0 ? `; chưa xếp được: ${skipped.join(", ")}` : ""}`,
  });
  return { created, skipped };
}

// Công bố mọi ca dự kiến cùng loại của học kỳ trong phạm vi khoa, báo mọi người liên quan.
export async function publishDrafts(tx: Transaction, viewer: Viewer, termId: string, kind: ExamKind) {
  await lockExamTerm(tx, termId);
  const drafts = await tx
    .select({ id: examSessions.id })
    .from(examSessions)
    .where(and(eq(examSessions.termId, termId), eq(examSessions.kind, kind), eq(examSessions.status, "draft")));
  const target: SessionForWrite[] = [];
  for (const draft of drafts) {
    const exam = await sessionForWrite(tx, draft.id);
    if (exam && inScope(viewer, exam.faculty)) target.push(exam);
  }
  if (target.length === 0) throw new ExamInputError("Không còn ca thi dự kiến nào để công bố.");
  const problems: string[] = [];
  const schedule = await termSchedule(tx, termId);
  for (const exam of target) {
    if (exam.hasStarted) {
      problems.push(`${exam.classCode}: giờ thi đã qua`);
      continue;
    }
    const roomRows = await tx
      .select({ id: examSessionRooms.id, proctors: sql<number>`(SELECT count(*) FROM exam_proctors p WHERE p.exam_room_id = ${examSessionRooms.id})::int` })
      .from(examSessionRooms)
      .where(eq(examSessionRooms.examSessionId, exam.id));
    if (roomRows.length === 0) problems.push(`${exam.classCode}: chưa có phòng thi`);
    else if (roomRows.some((room) => room.proctors < PROCTORS_PER_ROOM)) problems.push(`${exam.classCode}: phòng thiếu cán bộ coi thi`);
    else {
      try {
        await syncCandidates(tx, exam);
      } catch (error) {
        if (!(error instanceof ExamInputError)) throw error;
        problems.push(`${exam.classCode}: ${error.message}`);
      }
    }
    const self = schedule.find((session) => session.id === exam.id);
    if (self) {
      const clash = schedule.find(
        (other) =>
          other.id !== self.id && slotsOverlap(self, other) && (other.roomIds.some((roomId) => self.roomIds.includes(roomId)) || other.proctors.some((proctor) => self.proctors.some((entry) => entry.id === proctor.id))),
      );
      if (clash) problems.push(`${exam.classCode}: trùng phòng hoặc cán bộ coi thi với ${clash.classCode}`);
    }
  }
  if (problems.length > 0) throw new ExamInputError(`Chưa công bố được ${problems.length} ca: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "; ..." : ""}.`);
  await tx
    .update(examSessions)
    .set({ status: "published" })
    .where(
      inArray(
        examSessions.id,
        target.map((exam) => exam.id),
      ),
    );
  let notified = 0;
  for (const exam of target) {
    const roomCodes = await roomCodesOf(tx, exam.id);
    const sent = await notifyExamPeople(tx, exam, {
      title: `Lịch thi ${sessionLabel(exam)} đã công bố`,
      studentBody: `${exam.courseName}: ${describeSlot(exam, [])}. Xem phòng và số báo danh ở trang Lịch thi.`,
      staffBody: `${exam.courseName}: ${describeSlot(exam, roomCodes)}. Xem phòng coi thi ở trang Lịch thi.`,
    });
    notified += sent.students;
  }
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "publish",
    entityType: "exam",
    entityId: termId,
    entityLabel: `Lịch thi ${EXAM_KIND_LABEL[kind].toLowerCase()}`,
    summary: `Công bố ${target.length} ca thi ${EXAM_KIND_LABEL[kind].toLowerCase()}: ${target.map((exam) => exam.classCode).join(", ")}`,
  });
  return { ids: target.map((exam) => exam.id), notifiedStudents: notified };
}
