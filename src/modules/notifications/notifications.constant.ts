import type { NotificationKind } from "./notifications.type";

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  request: "Đơn từ",
  deadline: "Hạn chót",
  grade: "Điểm",
  exam: "Lịch thi",
  announcement: "Thông báo",
  advising: "Cố vấn",
  system: "Hệ thống",
};

export const NOTIFICATION_KIND_OPTIONS = Object.entries(NOTIFICATION_KIND_LABEL).map(([value, label]) => ({ value, label }));
