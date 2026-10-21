import "server-only";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { majors } from "@/modules/curriculum/curriculum.schema";
import { deliverQueuedMail, enqueueMail } from "@/modules/mail/mail.lib";
import { notifyLecturers, notifyStudents } from "@/modules/notifications/notifications.lib";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { AnnouncementAudience } from "@/modules/announcements/announcements.type";

type AnnouncementToSend = { id: string; slug: string; title: string; summary: string; content: string; audience: AnnouncementAudience; notifyPortal: boolean; notifyEmail: boolean };

export async function audienceRecipients(tx: Transaction | typeof db, audience: AnnouncementAudience) {
  const studentRows = audience.students
    ? await tx
        .select({ id: students.id, email: students.email })
        .from(students)
        .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
        .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
        .where(
          and(
            eq(students.status, "studying"),
            audience.cohorts.length > 0 ? inArray(administrativeClasses.cohort, audience.cohorts) : undefined,
            audience.majorIds.length > 0 ? inArray(majors.id, audience.majorIds) : undefined,
            audience.facultyIds.length > 0 ? inArray(majors.facultyId, audience.facultyIds) : undefined,
          ),
        )
    : [];
  const lecturerRows = audience.lecturers
    ? await tx
        .select({ id: lecturers.id, email: lecturers.email })
        .from(lecturers)
        .where(and(eq(lecturers.status, "active"), audience.facultyIds.length > 0 ? inArray(lecturers.facultyId, audience.facultyIds) : undefined))
    : [];
  return { students: studentRows, lecturers: lecturerRows };
}

export async function announceToAudience(tx: Transaction, announcement: AnnouncementToSend) {
  await tx.update(announcements).set({ notifiedAt: new Date() }).where(eq(announcements.id, announcement.id));
  if (!announcement.notifyPortal && !announcement.notifyEmail) return { notified: 0, mailIds: [] as string[] };
  const recipients = await audienceRecipients(tx, announcement.audience);
  const body = announcement.summary || announcement.content.slice(0, 300);
  let notified = 0;
  if (announcement.notifyPortal) {
    const message = { kind: "announcement" as const, title: announcement.title, body };
    notified += (await notifyStudents(tx, recipients.students.map((row) => row.id), { ...message, href: `/application/announcements/${announcement.slug}` })).length;
    notified += (await notifyLecturers(tx, recipients.lecturers.map((row) => row.id), { ...message, href: `/lecturer/announcements/${announcement.slug}` })).length;
  }
  const mailIds = announcement.notifyEmail
    ? await enqueueMail(tx, [
        ...(recipients.students.length > 0
          ? [
              {
                kind: "announcement" as const,
                to: recipients.students.map((row) => row.email),
                subject: announcement.title,
                text: `${announcement.content}\n\nXem trên cổng sinh viên: ${env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL}/application/announcements/${announcement.slug}`,
              },
            ]
          : []),
        ...(recipients.lecturers.length > 0
          ? [
              {
                kind: "announcement" as const,
                to: recipients.lecturers.map((row) => row.email),
                subject: announcement.title,
                text: `${announcement.content}\n\nXem trên cổng giảng viên: ${env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL}/lecturer/announcements/${announcement.slug}`,
              },
            ]
          : []),
      ])
    : [];
  return { notified, mailIds };
}

const SEND_COLUMNS = {
  id: announcements.id,
  slug: announcements.slug,
  title: announcements.title,
  summary: announcements.summary,
  content: announcements.content,
  audience: announcements.audience,
  notifyPortal: announcements.notifyPortal,
  notifyEmail: announcements.notifyEmail,
};

export async function publishDueAnnouncements() {
  const outcome = { announcements: 0, notified: 0, emailed: 0 };
  const mailIds = await db.transaction(async (tx) => {
    const due = await tx
      .select(SEND_COLUMNS)
      .from(announcements)
      .where(and(isNull(announcements.notifiedAt), or(eq(announcements.status, "published"), and(eq(announcements.status, "scheduled"), lte(announcements.publishedAt, sql`now()`)))))
      .limit(20)
      .for("update", { skipLocked: true });
    const ids: string[] = [];
    for (const announcement of due) {
      const sent = await announceToAudience(tx, announcement);
      outcome.announcements += 1;
      outcome.notified += sent.notified;
      ids.push(...sent.mailIds);
    }
    return ids;
  });
  const delivered = await deliverQueuedMail(mailIds);
  outcome.emailed = delivered.sent;
  return outcome;
}

export async function recordAnnouncementView(id: string) {
  await db
    .update(announcements)
    .set({ viewCount: sql`${announcements.viewCount} + 1` })
    .where(eq(announcements.id, id));
}
