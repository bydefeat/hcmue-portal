import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AppointmentMode, AppointmentStatus } from "@/modules/advising/advising.type";

export const APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  scheduled: { label: "Đã hẹn", tone: "neutral" },
  done: { label: "Đã gặp", tone: "success" },
  missed: { label: "Sinh viên vắng", tone: "warning" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
};

// Nhãn trạng thái nhìn từ phía sinh viên được mời.
export const STUDENT_APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  scheduled: { label: "Đã hẹn", tone: "neutral" },
  done: { label: "Đã gặp", tone: "success" },
  missed: { label: "Bạn vắng", tone: "warning" },
  cancelled: { label: "Cố vấn đã hủy", tone: "neutral" },
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

export const ADVISING_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  advising_appointments_duration_range: "Thời lượng buổi hẹn từ 5 đến 240 phút.",
  advising_appointments_done_note: "Buổi hẹn đã gặp phải có nội dung trao đổi.",
  appointment_students_appointment_id_student_id_pk: "Một sinh viên chỉ được mời một lần vào cùng buổi hẹn.",
  appointment_students_student_id_students_id_fk: "Sinh viên không còn trong danh sách.",
  advising_notes_student_id_students_id_fk: "Sinh viên không còn trong danh sách.",
};
