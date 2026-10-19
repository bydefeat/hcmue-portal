import "server-only";
import { cache } from "react";
import { and, desc, eq, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireRole } from "@/modules/authentication/authentication.query";
import { SLUG_PATTERN } from "@/modules/announcements/announcements.rule";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { Announcement, AnnouncementStatus } from "@/modules/announcements/announcements.type";

// Thông báo hẹn giờ tự thành "đã đăng" khi tới giờ, không cần tác vụ nền đổi trạng thái.
const effectiveStatus = sql<AnnouncementStatus>`CASE WHEN ${announcements.status} = 'scheduled' AND ${announcements.publishedAt} <= now() THEN 'published' ELSE ${announcements.status}::text END`;

export const isLive: SQL = or(eq(announcements.status, "published"), and(eq(announcements.status, "scheduled"), lte(announcements.publishedAt, sql`now()`)))!;

const ANNOUNCEMENT_COLUMNS = {
  id: announcements.id,
  slug: announcements.slug,
  title: announcements.title,
  category: announcements.category,
  audiences: announcements.audiences,
  status: effectiveStatus,
  isPinned: announcements.isPinned,
  publishedAt: announcements.publishedAt,
  deadline: announcements.deadline,
  author: announcements.authorLabel,
  summary: announcements.summary,
  content: announcements.content,
  views: announcements.viewCount,
};

type Row = { publishedAt: Date | null; deadline: Date | null } & Omit<Announcement, "publishedAt" | "deadline">;

function toAnnouncement({ publishedAt, deadline, ...row }: Row): Announcement {
  return { ...row, publishedAt: publishedAt?.toISOString() ?? null, deadline: deadline?.toISOString() ?? null };
}

// Ghim lên đầu, rồi mới nhất trước; bản nháp (chưa có ngày đăng) đứng đầu danh sách quản trị.
const ORDER = [desc(announcements.isPinned), sql`${announcements.publishedAt} DESC NULLS FIRST`, desc(announcements.id)];

// Cổng quản trị: mọi cán bộ xem được danh sách (trang tổng quan), sửa cần quyền announcements.manage ở action.
export async function getAnnouncements(id?: string): Promise<Announcement[]> {
  await requireRole("admin");
  if (id !== undefined && !isUuid(id)) return [];
  const rows = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(id ? eq(announcements.id, id) : undefined)
    .orderBy(...ORDER);
  return rows.map(toAnnouncement);
}

// Trang công khai, không cần đăng nhập: chỉ thông báo đã đăng (gồm hẹn giờ đã tới giờ).
export const getPublishedAnnouncements = cache(async (limit?: number): Promise<Announcement[]> => {
  const query = db.select(ANNOUNCEMENT_COLUMNS).from(announcements).where(isLive).orderBy(...ORDER).$dynamic();
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(toAnnouncement);
});

export const getPublishedAnnouncement = cache(async (slug: string): Promise<Announcement | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const [row] = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(and(eq(announcements.slug, slug), isLive))
    .limit(1);
  return row ? toAnnouncement(row) : null;
});
