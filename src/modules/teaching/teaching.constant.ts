import type { StatusMeta } from "@/shared/constants/status.constant";
import type { ClassAnnouncementStatus, SyllabusAssessment, SyllabusStatus } from "@/modules/teaching/teaching.type";

export const SYLLABUS_STATUS: Record<SyllabusStatus, StatusMeta> = {
  draft: { label: "Bản nháp, sinh viên chưa thấy", tone: "warning" },
  published: { label: "Đã công bố cho sinh viên", tone: "success" },
};

export const CLASS_ANNOUNCEMENT_STATUS: Record<ClassAnnouncementStatus, StatusMeta> = {
  published: { label: "Đã đăng", tone: "neutral" },
  scheduled: { label: "Hẹn giờ đăng", tone: "warning" },
};

export const SYLLABUS_WEEKS = 15;

export const TEACHING_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  syllabi_class_section_id_unique: "Lớp này đã có đề cương, tải lại trang để sửa bản đang có.",
  syllabi_published_fields: "Đề cương đã công bố phải có thời điểm công bố.",
  syllabus_outcomes_syllabus_id_code_unique: "Hai chuẩn đầu ra trùng mã.",
  syllabus_weeks_syllabus_id_week_pk: "Hai dòng kế hoạch trùng số tuần.",
  syllabus_weeks_week_range: "Tuần học phải từ 1 đến 20.",
  syllabus_assessments_syllabus_id_key_unique: "Hai hình thức đánh giá trùng nhau.",
  syllabus_assessments_weight_range: "Trọng số mỗi hình thức đánh giá từ 1% đến 100%.",
  syllabus_assessments_weights_total_100: "Tổng trọng số các hình thức đánh giá phải bằng 100%.",
  class_announcement_reads_announcement_fk: "Thông báo đã bị giảng viên xóa.",
};

export function assessmentMismatches(assessments: SyllabusAssessment[], components: { key: string; label: string; weight: number }[]) {
  const messages: string[] = [];
  const total = assessments.reduce((sum, item) => sum + item.weight, 0);
  if (total !== 100) messages.push(`Tổng trọng số trong đề cương là ${total}%, cần đúng 100%.`);
  for (const component of components) {
    const match = assessments.find((item) => item.key === component.key);
    if (!match) messages.push(`Bảng điểm có cột "${component.label}" (${component.weight}%) nhưng đề cương chưa có.`);
    else if (match.weight !== component.weight) messages.push(`"${component.label}": đề cương ${match.weight}%, bảng điểm ${component.weight}%.`);
  }
  for (const item of assessments) {
    if (!components.some((component) => component.key === item.key)) messages.push(`Đề cương có "${item.label}" nhưng bảng điểm không có cột này.`);
  }
  return messages;
}
