import type { StatusMeta } from "@/shared/constants/status.constant";
import type { ClassAnnouncementStatus, SyllabusStatus } from "@/modules/teaching/teaching.type";

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
  class_announcements_notified_published: "Thông báo đã báo tới sinh viên nên không chuyển lại thành hẹn giờ được.",
  syllabus_revisions_syllabus_id_version_unique: "Đề cương vừa được lưu phiên bản mới, tải lại trang.",
  syllabus_assessments_weights_versioned: "Đề cương đã công bố: đổi cách tính điểm phải lưu thành phiên bản mới kèm lý do.",
  syllabi_published_final: "Đề cương đã công bố không chuyển về nháp, không lùi phiên bản được.",
};
