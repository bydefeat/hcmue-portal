import type { StatusMeta } from "@/shared/constants/status.constant";
import type { GraduationStatus } from "@/modules/graduation/graduation.type";

export const GRADUATION_STATUS: Record<GraduationStatus, StatusMeta> = {
  eligible: { label: "Đủ điều kiện", tone: "success" },
  missing: { label: "Chưa đủ điều kiện", tone: "warning" },
  approved: { label: "Hội đồng đã công nhận", tone: "success" },
  graduated: { label: "Đã tốt nghiệp", tone: "neutral" },
};

export const UNCLASSIFIED_LABEL = "Không xếp loại";

export const GRADUATION_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  graduation_records_student_id_unique: "Sinh viên đã có hồ sơ xét tốt nghiệp.",
  graduation_records_decision_id_unique: "Quyết định này đã gắn với hồ sơ xét tốt nghiệp khác.",
  graduation_records_decided_fields: "Hồ sơ đã công nhận hoặc đã tốt nghiệp phải có thời điểm quyết định.",
  graduation_records_language_level: "Bậc ngoại ngữ phải từ A1 đến C2.",
  graduation_rounds_single_open: "Đang có một đợt xét tốt nghiệp mở, đóng đợt đó trước khi mở đợt mới.",
  graduation_rounds_has_cohort: "Đợt xét tốt nghiệp cần ít nhất một khóa.",
};
