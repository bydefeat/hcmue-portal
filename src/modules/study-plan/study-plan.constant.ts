import type { StatusMeta } from "@/shared/constants/status.constant";
import type { StudyPlanStatus } from "./study-plan.type";

export const STUDY_PLAN_STATUS: Record<StudyPlanStatus, StatusMeta> = {
  draft: { label: "Chưa nộp", tone: "neutral" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  returned: { label: "Đã trả lại", tone: "danger" },
};

export const PENDING_TOO_LONG_DAYS = 5;

export const STUDY_PLAN_CREDIT_LIMIT = { min: 14, max: 25 };
