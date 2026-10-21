import { z } from "zod";

export const MAIL_MAX_ATTEMPTS = 6;

export const MAIL_RETRY_DELAY_MINUTES = [1, 5, 30, 120, 480] as const;

export const MAIL_SENDING_LEASE_MINUTES = 10;

export const MAIL_SENT_RETENTION_DAYS = 30;

const MINUTE = 60_000;

export function afterFailedAttempt(attempts: number, now: Date): { status: "failed" } | { status: "pending"; nextAttemptAt: Date } {
  if (attempts >= MAIL_MAX_ATTEMPTS) return { status: "failed" };
  const delay = MAIL_RETRY_DELAY_MINUTES[Math.min(Math.max(attempts, 1), MAIL_RETRY_DELAY_MINUTES.length) - 1];
  return { status: "pending", nextAttemptAt: new Date(now.getTime() + delay * MINUTE) };
}

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
