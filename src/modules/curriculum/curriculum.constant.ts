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
