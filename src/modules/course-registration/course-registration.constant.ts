import type { StatusMeta } from "@/shared/constants/status.constant";
import type { ClassSectionStatus, RegistrationPeriodState } from "./course-registration.type";

export const CLOSING_SOON_HOURS = 48;

export const REGISTRATION_PERIOD_STATE: Record<RegistrationPeriodState, StatusMeta> = {
  upcoming: { label: "Sắp mở", tone: "neutral" },
  open: { label: "Đang mở", tone: "success" },
  closing: { label: "Sắp đóng", tone: "warning" },
  closed: { label: "Đã đóng", tone: "neutral" },
};

export const CLASS_SECTION_STATUS: Record<ClassSectionStatus, StatusMeta> = {
  draft: { label: "Nháp", tone: "neutral" },
  open: { label: "Mở đăng ký", tone: "success" },
  cancelled: { label: "Đã hủy", tone: "danger" },
};

export const CLASS_FULL_STATUS: StatusMeta = { label: "Đủ chỗ", tone: "warning" };

export const CLASS_SECTION_STATUS_OPTIONS = Object.entries(CLASS_SECTION_STATUS).map(([value, meta]) => ({
  value: value as ClassSectionStatus,
  label: meta.label,
}));

export const ROOMS = ["A.201", "A.203", "A.305", "B.302", "B.405", "B.408", "C.301 (Phòng máy)", "C.302 (Phòng máy)", "H.2.04", "H.3.11", "I.101 (Hội trường)"];
