import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AttendanceStatus } from "@/modules/schedule/schedule.type";

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

export const ABSENCE_STATUSES: readonly AttendanceStatus[] = ["absent", "excused"];

export const SCHEDULE_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  attendance_records_same_section: "Sinh viên không có trong danh sách lớp của buổi học này.",
  attendance_records_class_session_id_class_sessions_id_fk: "Buổi học không còn trong lịch, tải lại trang.",
  attendance_records_enrollment_id_enrollments_id_fk: "Sinh viên không còn đăng ký lớp này, tải lại trang.",
  class_sessions_slot_unique: "Lớp đã có buổi học trùng ngày và tiết bắt đầu.",
  class_sessions_period_range: "Tiết học phải từ 1 đến 12, tiết bắt đầu không sau tiết kết thúc.",
  class_sessions_lab_group_fk: "Nhóm thực hành không thuộc lớp học phần này.",
};
