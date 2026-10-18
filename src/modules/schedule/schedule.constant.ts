import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AttendanceStatus } from "./schedule.type";

export const ATTENDANCE_STATUS: Record<AttendanceStatus, StatusMeta & { short: string }> = {
  present: { label: "Có mặt", short: "C", tone: "success" },
  late: { label: "Đi trễ", short: "T", tone: "warning" },
  excused: { label: "Vắng có phép", short: "P", tone: "neutral" },
  absent: { label: "Vắng", short: "V", tone: "danger" },
};

export const ATTENDANCE_OPTIONS = (Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]).map((value) => ({
  value,
  label: ATTENDANCE_STATUS[value].label,
}));

export const ABSENCE_LIMIT_RATIO = 0.2;
