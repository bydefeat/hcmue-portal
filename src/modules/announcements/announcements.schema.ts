import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import type { AnnouncementAudience } from "@/modules/announcements/announcements.type";

export const announcementCategoryEnum = pgEnum("announcement_category", ["registration", "exam", "tuition", "academic", "event"]);
export const announcementStatusEnum = pgEnum("announcement_status", ["draft", "scheduled", "published", "archived"]);

export const announcements = pgTable(
  "announcements",
  {
    id: primaryId(),
    slug: text().notNull().unique("announcements_slug_unique"),
    title: text().notNull(),
    category: announcementCategoryEnum().notNull(),
    // Đối tượng có cấu trúc (sinh viên theo khóa, ngành, khoa; giảng viên theo khoa), kiểm bằng zod khi ghi. Thông báo không gửi
    // sinh viên (chỉ giảng viên) không hiện trên trang công khai.
    audience: jsonb().$type<AnnouncementAudience>().notNull().default(sql`'{"students":true,"lecturers":true,"cohorts":[],"facultyIds":[],"majorIds":[]}'::jsonb`),
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
    // Gửi kèm thông báo cá nhân trên cổng và thư cho đối tượng; notified_at ghi lúc đã gửi (đăng ngay, hoặc tác vụ
    // announcement-notifications khi bài hẹn giờ tới giờ đăng) để không gửi hai lần.
    notifyPortal: boolean().notNull().default(false),
    notifyEmail: boolean().notNull().default(false),
    notifiedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index().on(table.status, table.publishedAt),
    index().on(table.authorUserId),
    check("announcements_slug_format", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("announcements_published_fields", sql`${table.status} = 'draft' OR ${table.publishedAt} IS NOT NULL`),
    check("announcements_view_count_non_negative", sql`${table.viewCount} >= 0`),
    check("announcements_audience_object", sql`jsonb_typeof(${table.audience}) = 'object'`),
  ],
);
