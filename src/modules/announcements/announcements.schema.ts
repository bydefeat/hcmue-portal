import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";

export const announcementCategoryEnum = pgEnum("announcement_category", ["registration", "exam", "tuition", "academic", "event"]);
export const announcementStatusEnum = pgEnum("announcement_status", ["draft", "scheduled", "published", "archived"]);

export const announcements = pgTable(
  "announcements",
  {
    id: primaryId(),
    slug: text().notNull().unique("announcements_slug_unique"),
    title: text().notNull(),
    category: announcementCategoryEnum().notNull(),
    audiences: text().array().notNull().default(sql`'{}'::text[]`),
    status: announcementStatusEnum().notNull().default("draft"),
    isPinned: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),
    deadline: timestamp({ withTimezone: true }),
    authorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    // Đơn vị đứng tên thông báo (Phòng Khảo thí, Phòng Kế hoạch - Tài chính...), không phải người bấm đăng.
    authorLabel: text().notNull().default("Phòng Đào tạo"),
    summary: text().notNull(),
    content: text().notNull(),
    viewCount: integer().notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index().on(table.status, table.publishedAt),
    index().on(table.authorUserId),
    check("announcements_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("announcements_published_fields", sql`${table.status} = 'draft' OR ${table.publishedAt} IS NOT NULL`),
    check("announcements_view_count_non_negative", sql`${table.viewCount} >= 0`),
  ],
);
