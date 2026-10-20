import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AnnouncementCategory, AnnouncementStatus } from "@/modules/announcements/announcements.type";

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


export const ANNOUNCEMENT_CATEGORY_OPTIONS = Object.entries(ANNOUNCEMENT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export const ANNOUNCEMENT_STATUS_OPTIONS = Object.entries(ANNOUNCEMENT_STATUS).map(([value, meta]) => ({ value, label: meta.label }));

export const ANNOUNCEMENTS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  announcements_slug_unique: "Đã có thông báo cùng đường dẫn, đổi tiêu đề rồi lưu lại.",
  announcements_slug_format: "Đường dẫn thông báo chỉ gồm chữ thường không dấu, số và dấu gạch ngang.",
  announcements_published_fields: "Thông báo đã đăng, hẹn giờ hoặc đã gỡ phải có thời điểm đăng.",
  announcements_view_count_non_negative: "Lượt xem không được âm.",
};
