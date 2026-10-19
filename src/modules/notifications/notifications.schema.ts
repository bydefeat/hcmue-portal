import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";

export const notificationKindEnum = pgEnum("notification_kind", ["request", "deadline", "grade", "exam", "announcement", "advising", "system"]);
// Cổng nhận thông báo: một tài khoản có thể vừa là giảng viên vừa là cán bộ, mỗi cổng chỉ hiện thông báo (và đường dẫn) của cổng đó.
export const notificationAudienceEnum = pgEnum("notification_audience", ["student", "lecturer", "administrator"]);

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    recipientUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    audience: notificationAudienceEnum().notNull(),
    kind: notificationKindEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    href: text().notNull(),
    createdAt: createdAt(),
    readAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.recipientUserId, table.audience, table.createdAt),
    index("notifications_unread").on(table.recipientUserId).where(sql`${table.readAt} IS NULL`),
  ],
);
