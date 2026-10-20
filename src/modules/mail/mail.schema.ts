import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";

export const mailStatusEnum = pgEnum("mail_status", ["pending", "sending", "sent", "failed"]);
export const mailKindEnum = pgEnum("mail_kind", ["account-activation", "registration-reminder", "class-announcement"]);

// Hàng đợi thư: ghi cùng transaction với thao tác sinh ra thư, gửi sau commit và gửi lại khi lỗi.
// Mỗi dòng một người nhận để thử lại riêng từng người, không lộ địa chỉ của nhau.
export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: primaryId(),
    kind: mailKindEnum().notNull(),
    recipient: text().notNull(),
    subject: text().notNull(),
    text: text().notNull(),
    html: text(),
    status: mailStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    // Thư pending: lúc được gửi; thư sending: hết hạn giữ chỗ, quá giờ này coi như tiến trình gửi đã chết và lấy lại.
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    sentAt: timestamp({ withTimezone: true }),
    providerMessageId: text(),
  },
  (table) => [
    check("mail_outbox_recipient_format", sql`${table.recipient} ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND length(${table.recipient}) <= 320`),
    check("mail_outbox_subject_not_blank", sql`btrim(${table.subject}) <> ''`),
    check("mail_outbox_attempts_non_negative", sql`${table.attempts} >= 0`),
    check("mail_outbox_sent_fields", sql`(${table.status} = 'sent') = (${table.sentAt} IS NOT NULL)`),
    index("mail_outbox_due").on(table.nextAttemptAt).where(sql`${table.status} IN ('pending', 'sending')`),
    index("mail_outbox_sent_at").on(table.sentAt).where(sql`${table.status} = 'sent'`),
    index("mail_outbox_failed_created_at").on(table.createdAt).where(sql`${table.status} = 'failed'`),
  ],
);
