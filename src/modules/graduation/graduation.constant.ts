import type { StatusMeta } from "@/shared/constants/status.constant";
import type { GraduationStatus } from "@/modules/graduation/graduation.type";

export const GRADUATION_STATUS: Record<GraduationStatus, StatusMeta> = {
  eligible: { label: "Đủ điều kiện", tone: "success" },
  missing: { label: "Chưa đủ điều kiện", tone: "warning" },
  approved: { label: "Hội đồng đã công nhận", tone: "success" },
  graduated: { label: "Đã tốt nghiệp", tone: "neutral" },
};

export const GRADUATION_MIN_CPA = 2;

export const GRADUATION_CLASSIFICATION = [
  { min: 3.6, label: "Xuất sắc" },
  { min: 3.2, label: "Giỏi" },
  { min: 2.5, label: "Khá" },
  { min: 2, label: "Trung bình" },
  { min: 0, label: "Không xếp loại" },
];
