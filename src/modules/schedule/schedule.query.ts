import { dayjs, weekdayOf } from "@/shared/libs/date.lib";
import { mockDelay } from "@/shared/libs/mock-request.lib";
import { mockAttendanceRecords } from "@/modules/schedule/schedule.mock";
import type { AttendanceBook, AttendanceSession, MeetingInput } from "@/modules/schedule/schedule.type";

export function buildSessions(classSectionId: string, meetings: MeetingInput[], startDate: string, weeksAhead = 1): AttendanceSession[] {
  const today = dayjs().startOf("day");
  const until = today.add(weeksAhead, "week");
  const sessions: AttendanceSession[] = [];
  for (let date = dayjs(startDate).startOf("day"); !date.isAfter(until); date = date.add(1, "day")) {
    for (const meeting of meetings) {
      if (weekdayOf(date) !== meeting.dayOfWeek) continue;
      sessions.push({
        id: `${classSectionId}-${date.format("YYYYMMDD")}-${meeting.startPeriod}`,
        date: date.format("YYYY-MM-DD"),
        startPeriod: meeting.startPeriod,
        endPeriod: meeting.endPeriod,
        room: meeting.room,
        isTaken: date.isBefore(today),
      });
    }
  }
  return sessions;
}

export async function getAttendanceBook(
  classSectionId: string,
  studentIds: string[],
  meetings: MeetingInput[],
  startDate: string,
): Promise<AttendanceBook> {
  await mockDelay();
  const sessions = buildSessions(classSectionId, meetings, startDate);
  return { classSectionId, sessions, records: mockAttendanceRecords(sessions, studentIds) };
}
