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

export type Holiday = { title: string; startDate: string; endDate: string };

function holidayOn(date: string, holidays: Holiday[]) {
  return holidays.find((holiday) => holiday.startDate <= date && date <= holiday.endDate) ?? null;
}

type PlanSection = {
  id: string;
  startDate: string;
  endDate: string;
  meetings: WeeklySlot[];
  labGroups: (WeeklySlot & { id: string })[];
};

function weeklyPlans(section: PlanSection): SessionPlan[] {
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

// Khung buổi nghỉ theo đơn nghỉ dạy đã duyệt (class_session_leaves): bỏ khỏi lịch như ngày nghỉ lễ.
export type LeaveSlot = Pick<SessionPlan, "date" | "startPeriod" | "labGroupId">;

// Buổi học của một lớp sinh từ lịch tuần (lý thuyết cho cả lớp, thực hành theo nhóm) trong khoảng ngày học của lớp, bỏ các buổi
// rơi vào ngày nghỉ lễ của lịch năm học (calendar_events loại holiday) và các buổi nghỉ dạy đã duyệt.
export function planClassSessions(section: PlanSection, holidays: Holiday[] = [], leaves: LeaveSlot[] = []): SessionPlan[] {
  const skipped = new Set(leaves.map(slotKey));
  return weeklyPlans(section).filter((plan) => !holidayOn(plan.date, holidays) && !skipped.has(slotKey(plan)));
}

// Buổi của lớp trong ngày nghỉ dạy, giao với khoảng tiết nghỉ (đơn ghi buổi theo tiết bắt đầu - kết thúc).
export function sessionsInLeave<T extends { date: string; startPeriod: number; endPeriod: number }>(sessions: T[], leave: { date: string; startPeriod: number; endPeriod: number }) {
  return sessions.filter((session) => session.date === leave.date && session.startPeriod <= leave.endPeriod && session.endPeriod >= leave.startPeriod);
}

// Buổi theo lịch tuần bị trừ vì nghỉ lễ: giảng viên cần xếp dạy bù (đơn dạy bù ở mục Đơn từ).
export function holidaySessions(section: PlanSection, holidays: Holiday[]) {
  return weeklyPlans(section).flatMap((plan) => {
    const holiday = holidayOn(plan.date, holidays);
    return holiday ? [{ ...plan, holiday: holiday.title }] : [];
  });
}

export type ExistingSession = SessionPlan & { id: string; isTaken: boolean };

function slotKey(session: Pick<SessionPlan, "date" | "startPeriod" | "labGroupId">) {
  return `${session.date}|${session.startPeriod}|${session.labGroupId ?? ""}`;
}

// Lịch tuần đổi: buổi đã qua (trước hôm nay) và buổi đã điểm danh giữ nguyên làm lịch sử; buổi từ hôm nay trở đi chưa điểm danh
// mà không còn trong lịch mới thì bỏ, buổi mới chưa có thì thêm. Buổi tương lai trùng hệt lịch mới giữ nguyên id để không xáo trộn.
export function diffClassSessions(existing: ExistingSession[], plans: SessionPlan[], today: string) {
  const kept = existing.filter((session) => session.date < today || session.isTaken);
  const keptSlots = new Set(kept.map(slotKey));
  const wanted = plans.filter((plan) => plan.date >= today && !keptSlots.has(slotKey(plan)));
  const wantedByKey = new Map(wanted.map((plan) => [slotKey(plan), plan]));
  const future = existing.filter((session) => !(session.date < today || session.isTaken));
  const unchanged = new Set(
    future
      .filter((session) => {
        const plan = wantedByKey.get(slotKey(session));
        return plan !== undefined && plan.endPeriod === session.endPeriod && plan.roomId === session.roomId;
      })
      .map(slotKey),
  );
  return {
    removeIds: future.filter((session) => !unchanged.has(slotKey(session))).map((session) => session.id),
    add: wanted.filter((plan) => !unchanged.has(slotKey(plan))),
    kept: kept.length + unchanged.size,
  };
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
