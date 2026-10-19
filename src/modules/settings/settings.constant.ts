import type { CalendarEventKind } from "@/modules/settings/settings.type";

export const CALENDAR_EVENT_LABEL: Record<CalendarEventKind, string> = {
  teaching: "Giảng dạy",
  registration: "Đăng ký học phần",
  exam: "Thi",
  grading: "Nhập và công bố điểm",
  holiday: "Nghỉ lễ",
  event: "Sự kiện",
};

export const CALENDAR_EVENT_OPTIONS = Object.entries(CALENDAR_EVENT_LABEL).map(([value, label]) => ({ value, label }));
