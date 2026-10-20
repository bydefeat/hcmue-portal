import type { StatusMeta } from "@/shared/constants/status.constant";
import type { MailKind, MailStatus } from "@/modules/mail/mail.type";

export const MAIL_OUTBOX_HREF = "/administrator/settings/mail";

export const MAIL_KIND_LABEL: Record<MailKind, string> = {
  "account-activation": "Kích hoạt tài khoản",
  "registration-reminder": "Nhắc đăng ký học phần",
  "class-announcement": "Thông báo lớp",
  announcement: "Thông báo chung",
};

export const MAIL_STATUS: Record<MailStatus, StatusMeta> = {
  pending: { label: "Chờ gửi lại", tone: "warning" },
  sending: { label: "Đang gửi", tone: "neutral" },
  sent: { label: "Đã gửi", tone: "success" },
  failed: { label: "Lỗi, đã ngừng thử", tone: "danger" },
};

export const MAIL_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  mail_outbox_recipient_format: "Địa chỉ người nhận thư không hợp lệ.",
  mail_outbox_subject_not_blank: "Thư phải có tiêu đề.",
  mail_outbox_attempts_non_negative: "Số lần gửi thư không được âm.",
  mail_outbox_sent_fields: "Thư đã gửi phải có thời điểm gửi, thư chưa gửi thì không có.",
};
