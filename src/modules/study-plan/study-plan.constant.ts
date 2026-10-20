import type { StatusMeta } from "@/shared/constants/status.constant";
import type { StudyPlanStatus } from "@/modules/study-plan/study-plan.type";

export const STUDY_PLAN_STATUS: Record<StudyPlanStatus, StatusMeta> = {
  draft: { label: "Chưa nộp", tone: "neutral" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  returned: { label: "Đã trả lại", tone: "danger" },
};

export const STUDY_PLAN_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  study_plans_single_active: "Bạn đã có một kế hoạch học tập đang dùng, tải lại trang để sửa kế hoạch đó.",
  study_plans_submitted_fields: "Kế hoạch đã gửi phải có thời điểm gửi.",
  study_plans_reviewed_fields: "Kế hoạch đã duyệt hoặc trả lại phải có thời điểm xét duyệt.",
  study_plans_return_comment: "Trả lại kế hoạch phải kèm nhận xét cho sinh viên.",
  study_plan_items_study_plan_id_course_id_pk: "Một học phần chỉ xếp vào một học kỳ trong kế hoạch.",
  study_plan_items_semester_range: "Học kỳ trong kế hoạch phải là học kỳ 1, 2 hoặc hè.",
  study_plan_items_course_id_courses_id_fk: "Học phần không còn trong danh mục.",
};
