import type { StatusMeta } from "@/shared/constants/status.constant";
import type { GraduationStatus } from "@/modules/graduation/graduation.type";

export const GRADUATION_STATUS: Record<GraduationStatus, StatusMeta> = {
  eligible: { label: "Đủ điều kiện", tone: "success" },
  missing: { label: "Chưa đủ điều kiện", tone: "warning" },
  approved: { label: "Hội đồng đã công nhận", tone: "success" },
  graduated: { label: "Đã tốt nghiệp", tone: "neutral" },
};

export const GRADUATION_MIN_CPA = 2;

export const GRADUATING_COHORT = 48;

// Tối đa số tín chỉ yêu cầu khi xét, kể cả chương trình có tổng tín chỉ cao hơn.
export const GRADUATION_MAX_REQUIRED_CREDITS = 130;

export const GRADUATION_CLASSIFICATION = [
  { min: 3.6, label: "Xuất sắc" },
  { min: 3.2, label: "Giỏi" },
  { min: 2.5, label: "Khá" },
  { min: 2, label: "Trung bình" },
  { min: 0, label: "Không xếp loại" },
];

export const GRADUATION_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  graduation_records_student_id_unique: "Sinh viên đã có hồ sơ xét tốt nghiệp.",
  graduation_records_decision_id_unique: "Quyết định này đã gắn với hồ sơ xét tốt nghiệp khác.",
  graduation_records_decided_fields: "Hồ sơ đã công nhận hoặc đã tốt nghiệp phải có thời điểm quyết định.",
};
