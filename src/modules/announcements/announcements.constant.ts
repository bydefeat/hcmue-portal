import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AnnouncementCategory, AnnouncementStatus } from "./announcements.type";

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  registration: "Đăng ký học phần",
  exam: "Lịch thi",
  tuition: "Học phí",
  academic: "Học vụ",
  event: "Sự kiện",
};

export const ANNOUNCEMENT_STATUS: Record<AnnouncementStatus, StatusMeta> = {
  draft: { label: "Bản nháp", tone: "neutral" },
  scheduled: { label: "Hẹn giờ đăng", tone: "warning" },
  published: { label: "Đã đăng", tone: "success" },
  archived: { label: "Đã gỡ", tone: "neutral" },
};

export const ANNOUNCEMENT_AUDIENCES = ["Toàn trường", "Sinh viên", "Giảng viên", "Khóa 48", "Khóa 49", "Khóa 50", "Khóa 51", "Cố vấn học tập"];

export const ANNOUNCEMENT_CATEGORY_OPTIONS = Object.entries(ANNOUNCEMENT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export const ANNOUNCEMENT_STATUS_OPTIONS = Object.entries(ANNOUNCEMENT_STATUS).map(([value, meta]) => ({ value, label: meta.label }));
