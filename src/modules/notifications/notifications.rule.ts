import { z } from "zod";

export const NOTIFICATION_READ_SCHEMA = z.object({
  ids: z
    .array(z.uuid("Thông báo không hợp lệ"))
    .min(1, "Chưa chọn thông báo")
    .max(500, "Tối đa 500 thông báo mỗi lần")
    .transform((ids) => [...new Set(ids)]),
});

export type NotificationReadInput = z.input<typeof NOTIFICATION_READ_SCHEMA>;
