import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireRole, requireSession } from "@/modules/authentication/authentication.query";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { announcementVisibleTo, audienceLabel, SLUG_PATTERN } from "@/modules/announcements/announcements.rule";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { Announcement, AnnouncementAudienceOptions, AnnouncementStatus, AnnouncementViewer } from "@/modules/announcements/announcements.type";

const effectiveStatus = sql<AnnouncementStatus>`CASE WHEN ${announcements.status} = 'scheduled' AND ${announcements.publishedAt} <= now() THEN 'published' ELSE ${announcements.status}::text END`;

export const isLive: SQL = or(eq(announcements.status, "published"), and(eq(announcements.status, "scheduled"), lte(announcements.publishedAt, sql`now()`)))!;

const notExpired: SQL = or(isNull(announcements.deadline), gt(announcements.deadline, sql`now()`))!;

const isPublic: SQL = sql`(${announcements.audience}->>'students')::boolean`;

const ANNOUNCEMENT_COLUMNS = {
  id: announcements.id,
  slug: announcements.slug,
  title: announcements.title,
  category: announcements.category,
  audience: announcements.audience,
  status: effectiveStatus,
  isPinned: announcements.isPinned,
  publishedAt: announcements.publishedAt,
  deadline: announcements.deadline,
  author: announcements.authorLabel,
  summary: announcements.summary,
  content: announcements.content,
  views: announcements.viewCount,
  notifyPortal: announcements.notifyPortal,
  notifyEmail: announcements.notifyEmail,
  notifiedAt: announcements.notifiedAt,
};

type Row = { publishedAt: Date | null; deadline: Date | null; notifiedAt: Date | null } & Omit<Announcement, "publishedAt" | "deadline" | "notifiedAt" | "audienceLabel" | "isExpired">;

const audienceNames = cache(async () => {
  const [facultyRows, majorRows] = await Promise.all([db.select({ id: faculties.id, name: faculties.name }).from(faculties), db.select({ id: majors.id, name: majors.name }).from(majors)]);
  return { faculties: new Map(facultyRows.map((row) => [row.id, row.name])), majors: new Map(majorRows.map((row) => [row.id, row.name])) };
});

async function toAnnouncements(rows: Row[]): Promise<Announcement[]> {
  const names = await audienceNames();
  const now = Date.now();
  return rows.map(({ publishedAt, deadline, notifiedAt, ...row }) => ({
    ...row,
    audienceLabel: audienceLabel(row.audience, names),
    publishedAt: publishedAt?.toISOString() ?? null,
    deadline: deadline?.toISOString() ?? null,
    isExpired: deadline !== null && deadline.getTime() <= now,
    notifiedAt: notifiedAt?.toISOString() ?? null,
  }));
}

const ORDER = [desc(announcements.isPinned), sql`${announcements.publishedAt} DESC NULLS FIRST`, desc(announcements.id)];

export async function getAnnouncements(id?: string): Promise<Announcement[]> {
  await requireRole("admin");
  if (id !== undefined && !isUuid(id)) return [];
  const rows = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(id ? eq(announcements.id, id) : undefined)
    .orderBy(...ORDER);
  return toAnnouncements(rows);
}

export async function getAnnouncementAudienceOptions(): Promise<AnnouncementAudienceOptions> {
  await requireRole("admin");
  const [facultyRows, majorRows, cohortRows] = await Promise.all([
    db.select({ id: faculties.id, name: faculties.name }).from(faculties).orderBy(asc(faculties.name)),
    db.select({ id: majors.id, name: majors.name, facultyId: majors.facultyId }).from(majors).orderBy(asc(majors.name)),
    db.selectDistinct({ cohort: administrativeClasses.cohort }).from(administrativeClasses).orderBy(asc(administrativeClasses.cohort)),
  ]);
  return { faculties: facultyRows, majors: majorRows, cohorts: cohortRows.map((row) => row.cohort) };
}

export const getPublishedAnnouncements = cache(async (limit?: number): Promise<Announcement[]> => {
  const query = db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(and(isLive, isPublic, notExpired))
    .orderBy(...ORDER)
    .$dynamic();
  return toAnnouncements(await (limit ? query.limit(limit) : query));
});

export const getPublishedAnnouncement = cache(async (slug: string): Promise<Announcement | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const [row] = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(and(eq(announcements.slug, slug), isLive, isPublic))
    .limit(1);
  return row ? (await toAnnouncements([row]))[0] : null;
});

const portalViewer = cache(async (portal: "student" | "lecturer"): Promise<AnnouncementViewer | null> => {
  const { user } = await requireSession();
  if (portal === "student") {
    const [row] = await db
      .select({ cohort: administrativeClasses.cohort, majorId: majors.id, facultyId: majors.facultyId })
      .from(students)
      .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
      .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
      .where(eq(students.userId, user.id));
    return row ? { kind: "student", ...row } : null;
  }
  const [row] = await db.select({ facultyId: lecturers.facultyId }).from(lecturers).where(eq(lecturers.userId, user.id));
  return row ? { kind: "lecturer", facultyId: row.facultyId } : null;
});

export const getPortalAnnouncements = cache(async (portal: "student" | "lecturer", limit?: number): Promise<Announcement[]> => {
  const viewer = await portalViewer(portal);
  if (!viewer) return [];
  const rows = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(and(isLive, notExpired))
    .orderBy(...ORDER);
  const visible = rows.filter((row) => announcementVisibleTo(row.audience, viewer));
  return toAnnouncements(limit ? visible.slice(0, limit) : visible);
});

export async function getPortalAnnouncement(portal: "student" | "lecturer", slug: string): Promise<Announcement | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const viewer = await portalViewer(portal);
  if (!viewer) return null;
  const [row] = await db
    .select(ANNOUNCEMENT_COLUMNS)
    .from(announcements)
    .where(and(eq(announcements.slug, slug), isLive))
    .limit(1);
  return row && announcementVisibleTo(row.audience, viewer) ? (await toAnnouncements([row]))[0] : null;
}
