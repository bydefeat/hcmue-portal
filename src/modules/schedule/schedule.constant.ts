import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AttendanceStatus } from "./schedule.type";

export const ATTENDANCE_STATUS: Record<AttendanceStatus, StatusMeta> = {
  present: { label: "Có mặt", tone: "success" },
  late: { label: "Đi trễ", tone: "warning" },
  excused: { label: "Vắng có phép", tone: "neutral" },
  absent: { label: "Vắng", tone: "danger" },
};

export const ATTENDANCE_OPTIONS = (Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[]).map((value) => ({
  value,
  label: ATTENDANCE_STATUS[value].label,
}));

export const ABSENCE_LIMIT_RATIO = 0.2;
