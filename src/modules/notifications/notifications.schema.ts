import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";

export const notificationKindEnum = pgEnum("notification_kind", ["request", "deadline", "grade", "exam", "announcement", "advising", "system"]);

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    recipientUserId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKindEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    href: text().notNull(),
    createdAt: createdAt(),
    readAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.recipientUserId, table.createdAt),
    index("notifications_unread").on(table.recipientUserId).where(sql`${table.readAt} IS NULL`),
  ],
);
