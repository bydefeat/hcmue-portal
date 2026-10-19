import { z } from "zod";
import { dayjs, weekdayOf } from "@/shared/libs/date.lib";
import { ABSENCE_STATUSES, ATTENDANCE_STATUS } from "@/modules/schedule/schedule.constant";
import type { AttendanceStatus } from "@/modules/schedule/schedule.type";

type WeeklySlot = { dayOfWeek: number; startPeriod: number; endPeriod: number; roomId: string };

export type SessionPlan = {
  classSectionId: string;
  labGroupId: string | null;
  date: string;
  startPeriod: number;
  endPeriod: number;
  roomId: string;
};

// Các ngày trong [from, to] rơi vào thứ của lịch tuần (thứ 2..8, 8 là chủ nhật).
export function datesOnWeekday(dayOfWeek: number, from: string, to: string) {
  const dates: string[] = [];
  let date = dayjs(from).startOf("day");
  while (weekdayOf(date) !== dayOfWeek) date = date.add(1, "day");
  for (; !date.isAfter(to, "day"); date = date.add(1, "week")) dates.push(date.format("YYYY-MM-DD"));
  return dates;
}

// Buổi học của một lớp sinh từ lịch tuần (lý thuyết cho cả lớp, thực hành theo nhóm) trong khoảng ngày học của lớp.
export function planClassSessions(section: {
  id: string;
  startDate: string;
  endDate: string;
  meetings: WeeklySlot[];
  labGroups: (WeeklySlot & { id: string })[];
}): SessionPlan[] {
  const slots = [...section.meetings.map((meeting) => ({ ...meeting, labGroupId: null })), ...section.labGroups.map(({ id, ...slot }) => ({ ...slot, labGroupId: id }))];
  return slots
    .flatMap((slot) =>
      datesOnWeekday(slot.dayOfWeek, section.startDate, section.endDate).map((date) => ({
        classSectionId: section.id,
        labGroupId: slot.labGroupId,
        date,
        startPeriod: slot.startPeriod,
        endPeriod: slot.endPeriod,
        roomId: slot.roomId,
      })),
    )
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod);
}

export function isAbsence(status: AttendanceStatus | undefined) {
  return status !== undefined && ABSENCE_STATUSES.includes(status);
}

// Quy chế: vắng (kể cả có phép) từ ngưỡng phần trăm số buổi đã học trở lên thì không được dự thi.
export function isOverAbsenceLimit(absences: number, sessionsHeld: number, limitPercent: number) {
  return sessionsHeld > 0 && (absences / sessionsHeld) * 100 >= limitPercent;
}

// Vắng thêm một buổi nữa là chạm ngưỡng, để giảng viên nhắc sinh viên.
export function isNearAbsenceLimit(absences: number, sessionsHeld: number, limitPercent: number) {
  return sessionsHeld > 0 && !isOverAbsenceLimit(absences, sessionsHeld, limitPercent) && isOverAbsenceLimit(absences + 1, sessionsHeld, limitPercent);
}

const STATUSES = Object.keys(ATTENDANCE_STATUS) as [AttendanceStatus, ...AttendanceStatus[]];

// Lưu điểm danh một buổi: phải có trạng thái cho đủ mọi sinh viên của buổi, mỗi người một lần.
export const ATTENDANCE_SAVE_SCHEMA = z.object({
  classSessionId: z.uuid("Buổi học không hợp lệ"),
  records: z
    .array(z.object({ studentId: z.uuid("Sinh viên không hợp lệ"), status: z.enum(STATUSES, "Chọn trạng thái điểm danh") }))
    .min(1, "Chưa có sinh viên nào được điểm danh")
    .max(500)
    .refine((records) => new Set(records.map((record) => record.studentId)).size === records.length, "Mỗi sinh viên chỉ điểm danh một lần trong buổi"),
});

export type AttendanceSaveInput = z.input<typeof ATTENDANCE_SAVE_SCHEMA>;
