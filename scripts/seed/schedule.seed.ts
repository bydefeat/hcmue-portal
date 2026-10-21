import { and, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockId } from "@/shared/libs/mock.lib";
import { PERIODS } from "@/shared/constants/period.constant";
import { classSections, enrollments, labGroups, sectionMeetings } from "@/modules/course-registration/course-registration.schema";
import { mockAttendanceRecords, mockSessionKey } from "@/modules/schedule/schedule.mock";
import { planClassSessions } from "@/modules/schedule/schedule.rule";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { CALENDAR_EVENTS } from "@/modules/settings/settings.mock";
import type { SeedContext } from "./context";

const CHUNK = 1000;

export async function seedSchedule(tx: Transaction, _context: SeedContext) {
  const sections = await tx.select().from(classSections).where(eq(classSections.status, "open"));
  const sectionIds = sections.map((section) => section.id);
  const [meetings, labs, roster] = await Promise.all([
    tx.select().from(sectionMeetings).where(inArray(sectionMeetings.classSectionId, sectionIds)),
    tx.select().from(labGroups).where(inArray(labGroups.classSectionId, sectionIds)),
    tx
      .select({ id: enrollments.id, sectionId: enrollments.classSectionId, studentId: enrollments.studentId, labGroupId: enrollments.labGroupId })
      .from(enrollments)
      .where(and(inArray(enrollments.classSectionId, sectionIds), eq(enrollments.status, "enrolled"))),
  ]);
  const today = dayjs().format("YYYY-MM-DD");
  const holidays = CALENDAR_EVENTS.filter((event) => event.kind === "holiday");

  const sessionRows: (typeof classSessions.$inferInsert)[] = [];
  const recordRows: (typeof attendanceRecords.$inferInsert)[] = [];
  for (const section of sections) {
    const plans = planClassSessions({
      id: section.id,
      startDate: section.startDate,
      endDate: section.endDate,
      meetings: meetings.filter((meeting) => meeting.classSectionId === section.id),
      labGroups: labs.filter((lab) => lab.classSectionId === section.id),
    }, holidays);
    const members = roster.filter((entry) => entry.sectionId === section.id);
    for (const plan of plans) {
      const key = mockSessionKey(section.id, plan.date, plan.startPeriod) + (plan.labGroupId ? `-${plan.labGroupId}` : "");
      const id = mockId(`class-session:${key}`);
      const isTaken = plan.date < today;
      const end = PERIODS.find((period) => period.period === plan.endPeriod)!.end;
      sessionRows.push({ id, ...plan, takenAt: isTaken ? dayjs(`${plan.date}T${end}:00+07:00`).toDate() : null });
      if (!isTaken) continue;
      const attendees = members.filter((entry) => plan.labGroupId === null || entry.labGroupId === plan.labGroupId);
      const statuses = mockAttendanceRecords([{ id: key, isTaken }], attendees.map((entry) => entry.studentId))[key];
      for (const entry of attendees) recordRows.push({ classSessionId: id, enrollmentId: entry.id, status: statuses[entry.studentId] });
    }
  }
  for (let start = 0; start < sessionRows.length; start += CHUNK) await tx.insert(classSessions).values(sessionRows.slice(start, start + CHUNK));
  for (let start = 0; start < recordRows.length; start += CHUNK) await tx.insert(attendanceRecords).values(recordRows.slice(start, start + CHUNK));
  return { sessions: sessionRows.length, records: recordRows.length };
}
