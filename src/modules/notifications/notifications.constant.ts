import type { NotificationKind } from "@/modules/notifications/notifications.type";

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  request: "Đơn từ",
  deadline: "Hạn chót",
  grade: "Điểm",
  exam: "Lịch thi",
  announcement: "Thông báo",
  advising: "Cố vấn",
  system: "Hệ thống",
};

export const NOTIFICATION_PAGE_SIZE = 30;

export const NOTIFICATION_READ_RETENTION_DAYS = 180;
export const NOTIFICATION_UNREAD_RETENTION_DAYS = 365;
