import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AppointmentMode, AppointmentStatus } from "./advising.type";

export const APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  scheduled: { label: "Đã hẹn", tone: "neutral" },
  done: { label: "Đã gặp", tone: "success" },
  missed: { label: "Sinh viên vắng", tone: "warning" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
};

export const APPOINTMENT_MODE_LABEL: Record<AppointmentMode, string> = {
  "in-person": "Gặp trực tiếp",
  online: "Trực tuyến",
};

export const APPOINTMENT_TOPICS = [
  "Tư vấn kế hoạch học tập học kỳ 2",
  "Trao đổi về cảnh báo học vụ",
  "Định hướng chuyên ngành, thực tập",
  "Hỗ trợ đăng ký học phần",
  "Sinh hoạt lớp định kỳ",
];

export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90];
