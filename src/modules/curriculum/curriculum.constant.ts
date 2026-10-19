import type { StatusMeta } from "@/shared/constants/status.constant";
import type { CourseType, KnowledgeBlock, ProgramStatus } from "@/modules/curriculum/curriculum.type";

export const PROGRAM_STATUS: Record<ProgramStatus, StatusMeta> = {
  active: { label: "Đang áp dụng", tone: "neutral" },
  draft: { label: "Bản nháp", tone: "warning" },
  archived: { label: "Ngừng áp dụng", tone: "neutral" },
};

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  required: "Bắt buộc",
  elective: "Tự chọn",
};

export const KNOWLEDGE_BLOCK_LABEL: Record<KnowledgeBlock, string> = {
  general: "Giáo dục đại cương",
  foundation: "Cơ sở ngành",
  major: "Chuyên ngành",
  internship: "Thực tập, khóa luận",
};

export const DEGREE_OPTIONS = ["Cử nhân", "Cử nhân Sư phạm", "Kỹ sư"].map((value) => ({ value, label: value }));

export const COURSE_TYPE_OPTIONS = Object.entries(COURSE_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export const KNOWLEDGE_BLOCK_OPTIONS = Object.entries(KNOWLEDGE_BLOCK_LABEL).map(([value, label]) => ({ value, label }));

export const PROGRAM_STATUS_OPTIONS = Object.entries(PROGRAM_STATUS).map(([value, meta]) => ({ value, label: meta.label }));

export const CURRICULUM_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  courses_code_unique: "Mã học phần đã có trong danh mục.",
  courses_credits_positive: "Số tín chỉ phải lớn hơn 0.",
  courses_credit_split: "Lý thuyết cộng thực hành phải bằng số tín chỉ.",
  course_relations_not_self: "Học phần không thể liên quan tới chính nó.",
  programs_total_credits_positive: "Tổng tín chỉ phải lớn hơn 0.",
  programs_duration_range: "Thời gian đào tạo từ 1 đến 8 năm.",
  program_courses_program_id_course_id_pk: "Học phần đã có trong khung chương trình.",
  program_courses_semester_range: "Học kỳ trong khung từ 1 đến 12.",
  program_courses_semester_within_duration: "Học kỳ vượt quá thời gian đào tạo của chương trình (mỗi năm hai học kỳ).",
  program_courses_program_archived: "Chương trình đã ngừng áp dụng, khung chỉ xem được.",
};
