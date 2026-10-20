import { z } from "zod";

// Số lần gửi tối đa của một thư; lần thứ MAIL_MAX_ATTEMPTS vẫn lỗi thì chuyển failed, chờ quản trị bấm "Gửi lại".
export const MAIL_MAX_ATTEMPTS = 6;

// Chờ trước lần gửi lại thứ n (sau n lần lỗi): lùi dần để Resend hoặc mạng kịp hồi lại, tổng cộng khoảng 10 giờ.
export const MAIL_RETRY_DELAY_MINUTES = [1, 5, 30, 120, 480] as const;

// Thư đang gửi giữ chỗ ngần này phút: quá thời gian mà chưa xong thì coi như tiến trình gửi đã chết, lần chạy sau lấy lại.
// Dài hơn hẳn thời gian chờ Resend (10 giây) để không gửi trùng khi lần gửi trước chỉ chậm.
export const MAIL_SENDING_LEASE_MINUTES = 10;

// Thư đã gửi giữ lại ngần này ngày để thống kê, sau đó tác vụ mail-outbox xóa cho bảng nhỏ.
export const MAIL_SENT_RETENTION_DAYS = 30;

const MINUTE = 60_000;

// attempts là số lần đã gửi tính cả lần vừa lỗi.
export function afterFailedAttempt(attempts: number, now: Date): { status: "failed" } | { status: "pending"; nextAttemptAt: Date } {
  if (attempts >= MAIL_MAX_ATTEMPTS) return { status: "failed" };
  const delay = MAIL_RETRY_DELAY_MINUTES[Math.min(Math.max(attempts, 1), MAIL_RETRY_DELAY_MINUTES.length) - 1];
  return { status: "pending", nextAttemptAt: new Date(now.getTime() + delay * MINUTE) };
}

// Lỗi Resend có thể dài (thân HTML của proxy); giữ đủ để đọc ra nguyên nhân.
export function clipMailError(error: string) {
  const trimmed = error.trim() || "Không rõ lỗi";
  return trimmed.length > 500 ? `${trimmed.slice(0, 499)}…` : trimmed;
}

export function uniqueRecipients(addresses: string[]) {
  return [...new Set(addresses.map((address) => address.trim()).filter(Boolean))];
}

export const MAIL_RETRY_SCHEMA = z.object({
  ids: z
    .array(z.uuid())
    .min(1, "Chưa chọn thư")
    .max(500, "Mỗi lần gửi lại tối đa 500 thư")
    .transform((ids) => [...new Set(ids)]),
});

export type MailRetryInput = z.input<typeof MAIL_RETRY_SCHEMA>;
