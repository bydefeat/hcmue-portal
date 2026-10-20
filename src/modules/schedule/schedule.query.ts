import "server-only";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { classSections, enrollments, labGroups, sectionMeetings } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { holidaysBetween } from "@/modules/schedule/schedule.lib";
import { holidaySessions } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessionLeaves, classSessions } from "@/modules/schedule/schedule.schema";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import type { AttendanceBook, ScheduleEvent, ScheduleSession, Timetable } from "@/modules/schedule/schedule.type";

type TimetableSection = { id: string; code: string; courseName: string; credits: number };

// Lịch tuần của các lớp: buổi lý thuyết của lớp và buổi thực hành của nhóm (labGroupIds null là mọi nhóm của lớp).
async function weeklyEvents(sections: TimetableSection[], labGroupIds: string[] | null, href?: (sectionId: string) => string): Promise<Timetable> {
  if (sections.length === 0) return { events: [], sessions: [], sectionCount: 0, credits: 0 };
  const sectionIds = sections.map((section) => section.id);
  const [meetings, labs] = await Promise.all([
    db
      .select({ sectionId: sectionMeetings.classSectionId, dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, room: rooms.code })
      .from(sectionMeetings)
      .innerJoin(rooms, eq(rooms.id, sectionMeetings.roomId))
      .where(inArray(sectionMeetings.classSectionId, sectionIds))
      .orderBy(asc(sectionMeetings.dayOfWeek), asc(sectionMeetings.startPeriod)),
    labGroupIds !== null && labGroupIds.length === 0
      ? []
      : db
          .select({ id: labGroups.id, sectionId: labGroups.classSectionId, code: labGroups.code, dayOfWeek: labGroups.dayOfWeek, startPeriod: labGroups.startPeriod, endPeriod: labGroups.endPeriod, room: rooms.code })
          .from(labGroups)
          .innerJoin(rooms, eq(rooms.id, labGroups.roomId))
          .where(labGroupIds === null ? inArray(labGroups.classSectionId, sectionIds) : inArray(labGroups.id, labGroupIds))
          .orderBy(asc(labGroups.code)),
  ]);
  const sectionOf = new Map(sections.map((section) => [section.id, section]));
  const events: ScheduleEvent[] = [
    ...sections.flatMap((section) =>
      meetings
        .filter((meeting) => meeting.sectionId === section.id)
        .map((meeting, index) => ({
          id: `${section.id}-${index}`,
          title: section.courseName,
          code: section.code,
          dayOfWeek: meeting.dayOfWeek,
          startPeriod: meeting.startPeriod,
          endPeriod: meeting.endPeriod,
          room: meeting.room,
          href: href?.(section.id),
        })),
    ),
    ...labs.map((lab) => {
      const section = sectionOf.get(lab.sectionId)!;
      return {
        id: `${section.id}-${lab.id}`,
        title: `${section.courseName} (thực hành)`,
        code: lab.code,
        dayOfWeek: lab.dayOfWeek,
        startPeriod: lab.startPeriod,
        endPeriod: lab.endPeriod,
        room: lab.room,
        href: href?.(section.id),
      };
    }),
  ];
  return { events, sessions: [], sectionCount: sections.length, credits: sections.reduce((sum, section) => sum + section.credits, 0) };
}

// Buổi học thật của các lớp (đã trừ ngày nghỉ lễ, theo lịch đã đổi): buổi lý thuyết và buổi của nhóm thực hành được chọn
// (labGroupIds null là mọi nhóm).
async function sessionsOf(sections: TimetableSection[], labGroupIds: string[] | null): Promise<ScheduleSession[]> {
  if (sections.length === 0) return [];
  const sectionOf = new Map(sections.map((section) => [section.id, section]));
  const rows = await db
    .select({ id: classSessions.id, sectionId: classSessions.classSectionId, date: classSessions.date, startPeriod: classSessions.startPeriod, endPeriod: classSessions.endPeriod, room: rooms.code, labCode: labGroups.code })
    .from(classSessions)
    .innerJoin(rooms, eq(rooms.id, classSessions.roomId))
    .leftJoin(labGroups, eq(labGroups.id, classSessions.labGroupId))
    .where(
      and(
        inArray(classSessions.classSectionId, sections.map((section) => section.id)),
        labGroupIds === null ? undefined : labGroupIds.length > 0 ? or(isNull(classSessions.labGroupId), inArray(classSessions.labGroupId, labGroupIds)) : isNull(classSessions.labGroupId),
      ),
    )
    .orderBy(asc(classSessions.date), asc(classSessions.startPeriod));
  return rows.map((row) => {
    const section = sectionOf.get(row.sectionId)!;
    return { id: row.id, date: row.date, startPeriod: row.startPeriod, endPeriod: row.endPeriod, room: row.room, title: row.labCode ? `${section.courseName} (thực hành)` : section.courseName, code: row.labCode ?? section.code };
  });
}

const sectionColumns = { id: classSections.id, code: classSections.code, courseName: courses.name, credits: courses.credits };

// Thời khóa biểu của sinh viên đang đăng nhập: các lớp đang đăng ký trong học kỳ, kèm nhóm thực hành đã chọn.
export async function getStudentTimetable(termId: string): Promise<Timetable> {
  const student = await getCurrentStudent();
  if (!isUuid(termId)) return { events: [], sessions: [], sectionCount: 0, credits: 0 };
  const rows = await db
    .select({ ...sectionColumns, labGroupId: enrollments.labGroupId })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled"), ne(classSections.status, "cancelled")))
    .orderBy(asc(classSections.code));
  const sections = rows.map(({ labGroupId: _labGroupId, ...section }) => section);
  const labIds = rows.flatMap((row) => (row.labGroupId ? [row.labGroupId] : []));
  const [timetable, sessions] = await Promise.all([weeklyEvents(sections, labIds, (sectionId) => `/application/classes/${sectionId}`), sessionsOf(sections, labIds)]);
  return { ...timetable, sessions };
}

// Lịch dạy của giảng viên đang đăng nhập: mọi buổi lý thuyết và thực hành của lớp được phân công.
export async function getLecturerTimetable(termId: string): Promise<Timetable> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(termId)) return { events: [], sessions: [], sectionCount: 0, credits: 0 };
  const sections = await db
    .select(sectionColumns)
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(and(eq(classSections.lecturerId, lecturer.id), eq(classSections.termId, termId), ne(classSections.status, "cancelled")))
    .orderBy(asc(classSections.code));
  const [timetable, sessions] = await Promise.all([weeklyEvents(sections, null, (sectionId) => `/lecturer/classes/${sectionId}`), sessionsOf(sections, null)]);
  return { ...timetable, sessions };
}

// Sổ điểm danh của một lớp, chỉ giảng viên dạy lớp đó xem được. Buổi "đã học" là buổi giảng viên đã lưu điểm danh.
export async function getAttendanceBook(classSectionId: string): Promise<AttendanceBook | null> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(classSectionId)) return null;
  const [section] = await db
    .select({ id: classSections.id, startDate: classSections.startDate, endDate: classSections.endDate, status: classSections.status })
    .from(classSections)
    .where(and(eq(classSections.id, classSectionId), eq(classSections.lecturerId, lecturer.id)));
  if (!section) return null;
  const [sessions, records, roster, meetings, labs, holidays, [{ today }], leaves] = await Promise.all([
    db
      .select({
        id: classSessions.id,
        date: classSessions.date,
        startPeriod: classSessions.startPeriod,
        endPeriod: classSessions.endPeriod,
        room: rooms.code,
        labGroupId: classSessions.labGroupId,
        labGroupCode: labGroups.code,
        takenAt: classSessions.takenAt,
      })
      .from(classSessions)
      .innerJoin(rooms, eq(rooms.id, classSessions.roomId))
      .leftJoin(labGroups, eq(labGroups.id, classSessions.labGroupId))
      .where(eq(classSessions.classSectionId, classSectionId))
      .orderBy(asc(classSessions.date), asc(classSessions.startPeriod), asc(labGroups.code)),
    db
      .select({ sessionId: attendanceRecords.classSessionId, studentId: enrollments.studentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.classSessionId))
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .where(eq(classSessions.classSectionId, classSectionId)),
    db
      .select({ studentId: enrollments.studentId, labGroupId: enrollments.labGroupId })
      .from(enrollments)
      .where(and(eq(enrollments.classSectionId, classSectionId), eq(enrollments.status, "enrolled"))),
    db.select({ dayOfWeek: sectionMeetings.dayOfWeek, startPeriod: sectionMeetings.startPeriod, endPeriod: sectionMeetings.endPeriod, roomId: sectionMeetings.roomId }).from(sectionMeetings).where(eq(sectionMeetings.classSectionId, classSectionId)),
    db.select({ id: labGroups.id, code: labGroups.code, dayOfWeek: labGroups.dayOfWeek, startPeriod: labGroups.startPeriod, endPeriod: labGroups.endPeriod, roomId: labGroups.roomId }).from(labGroups).where(eq(labGroups.classSectionId, classSectionId)),
    holidaysBetween(db, section.startDate, section.endDate),
    db.execute<{ today: string }>(sql`SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`),
    db
      .select({ date: classSessionLeaves.date, startPeriod: classSessionLeaves.startPeriod, endPeriod: classSessionLeaves.endPeriod, labGroupId: classSessionLeaves.labGroupId, makeupNote: classSessionLeaves.makeupNote })
      .from(classSessionLeaves)
      .where(eq(classSessionLeaves.classSectionId, classSectionId))
      .orderBy(asc(classSessionLeaves.date), asc(classSessionLeaves.startPeriod)),
  ]);
  const book: AttendanceBook["records"] = {};
  for (const record of records) (book[record.sessionId] ??= {})[record.studentId] = record.status;
  const labCode = new Map(labs.map((lab) => [lab.id, lab.code]));
  const missed = section.status === "open" ? holidaySessions({ id: section.id, startDate: section.startDate, endDate: section.endDate, meetings, labGroups: labs }, holidays) : [];
  return {
    classSectionId,
    today,
    // Buổi nghỉ lễ và buổi nghỉ dạy đã duyệt đều là buổi cần dạy bù.
    holidaySessions: [
      ...missed.map((plan) => ({ date: plan.date, startPeriod: plan.startPeriod, endPeriod: plan.endPeriod, labGroupCode: plan.labGroupId ? (labCode.get(plan.labGroupId) ?? null) : null, holiday: plan.holiday })),
      ...leaves.map((leave) => ({
        date: leave.date,
        startPeriod: leave.startPeriod,
        endPeriod: leave.endPeriod,
        labGroupCode: leave.labGroupId ? (labCode.get(leave.labGroupId) ?? null) : null,
        holiday: leave.makeupNote ? `Nghỉ dạy, dạy bù ${leave.makeupNote}` : "Nghỉ dạy theo đơn",
      })),
    ].toSorted((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod),
    sessions: sessions.map(({ takenAt, ...session }) => ({ ...session, isTaken: takenAt !== null })),
    records: book,
    labGroupOf: Object.fromEntries(roster.map((entry) => [entry.studentId, entry.labGroupId])),
  };
}
