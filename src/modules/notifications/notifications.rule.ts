import { z } from "zod";

const ids = z
  .array(z.uuid("Thông báo không hợp lệ"))
  .min(1, "Chưa chọn thông báo")
  .max(500, "Tối đa 500 thông báo mỗi lần")
  .transform((values) => [...new Set(values)]);

export const NOTIFICATION_READ_SCHEMA = z.object({ ids });

export type NotificationReadInput = z.input<typeof NOTIFICATION_READ_SCHEMA>;

export const NOTIFICATION_DELETE_SCHEMA = z.object({ ids });

export type NotificationDeleteInput = z.input<typeof NOTIFICATION_DELETE_SCHEMA>;

export const NOTIFICATION_AUDIENCE_SCHEMA = z.enum(["administrator", "lecturer", "student"], "Cổng không hợp lệ");

export const NOTIFICATION_PAGE_SCHEMA = z.object({
  audience: NOTIFICATION_AUDIENCE_SCHEMA,
  cursor: z.string().max(100).optional(),
  kind: z.enum(["request", "deadline", "grade", "exam", "announcement", "advising", "system"]).optional(),
  unreadOnly: z.boolean().optional(),
});

export type NotificationPageInput = z.input<typeof NOTIFICATION_PAGE_SCHEMA>;

export function notificationPurgeCutoffs(now: Date, readDays: number, unreadDays: number) {
  const day = 24 * 3_600_000;
  return { read: new Date(now.getTime() - readDays * day), unread: new Date(now.getTime() - unreadDays * day) };
}
