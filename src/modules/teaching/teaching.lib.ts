import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { deliverQueuedMail, enqueueMail } from "@/modules/mail/mail.lib";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import type { z } from "zod";
import { recordAudit, type AuditActor } from "@/modules/audit/audit.lib";
import { SYLLABUS_WEEKS } from "@/modules/teaching/teaching.constant";
import { effectiveAnnouncementStatus, gradingChanged, type SYLLABUS_SCHEMA } from "@/modules/teaching/teaching.rule";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusOutcomes, syllabusRevisions, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, ClassLecturer, StudentClass, StudentClassAnnouncement, Syllabus, SyllabusWeek } from "@/modules/teaching/teaching.type";
import { lecturers, students } from "@/modules/users/users.schema";

type Executor = Transaction | typeof db;

export const classPageHref = (classSectionId: string) => `/application/classes/${classSectionId}`;

const blankWeek = (week: number): SyllabusWeek => ({ week, topic: "", activities: "", readings: "" });

export function fillWeeks(weeks: SyllabusWeek[]) {
  const total = Math.max(SYLLABUS_WEEKS, ...weeks.map((week) => week.week));
  const byWeek = new Map(weeks.map((week) => [week.week, week]));
  return Array.from({ length: total }, (_, index) => byWeek.get(index + 1) ?? blankWeek(index + 1));
}

export async function readSyllabus(classSectionId: string): Promise<Syllabus | null> {
  const [row] = await db
    .select({
      id: syllabi.id,
      classSectionId: syllabi.classSectionId,
      courseCode: courses.code,
      courseName: courses.name,
      status: syllabi.status,
      publishedAt: syllabi.publishedAt,
      updatedAt: syllabi.updatedAt,
      version: syllabi.version,
      description: syllabi.description,
      references: syllabi.references,
    })
    .from(syllabi)
    .innerJoin(classSections, eq(classSections.id, syllabi.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(eq(syllabi.classSectionId, classSectionId));
  if (!row) return null;
  const [outcomes, weeks, assessments, revisions] = await Promise.all([
    db
      .select({ code: syllabusOutcomes.code, text: syllabusOutcomes.text })
      .from(syllabusOutcomes)
      .where(eq(syllabusOutcomes.syllabusId, row.id))
      .orderBy(asc(syllabusOutcomes.position)),
    db
      .select({ week: syllabusWeeks.week, topic: syllabusWeeks.topic, activities: syllabusWeeks.activities, readings: syllabusWeeks.readings })
      .from(syllabusWeeks)
      .where(eq(syllabusWeeks.syllabusId, row.id))
      .orderBy(asc(syllabusWeeks.week)),
    db
      .select({
        key: syllabusAssessments.key,
        label: syllabusAssessments.label,
        weight: syllabusAssessments.weight,
        method: syllabusAssessments.method,
        outcomes: syllabusAssessments.outcomeCodes,
      })
      .from(syllabusAssessments)
      .where(eq(syllabusAssessments.syllabusId, row.id))
      .orderBy(asc(syllabusAssessments.position)),
    db
      .select({ version: syllabusRevisions.version, revisedAt: syllabusRevisions.revisedAt, note: syllabusRevisions.note, assessments: syllabusRevisions.assessments })
      .from(syllabusRevisions)
      .where(eq(syllabusRevisions.syllabusId, row.id))
      .orderBy(desc(syllabusRevisions.version)),
  ]);
  const { id: _id, publishedAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    publishedAt: publishedAt?.toISOString() ?? null,
    updatedAt: updatedAt.toISOString(),
    outcomes,
    weeks: fillWeeks(weeks),
    assessments,
    revisions: revisions.map((revision) => ({ ...revision, revisedAt: revision.revisedAt.toISOString() })),
  };
}

const readCount = sql<number>`(SELECT count(*) FROM class_announcement_reads r WHERE r.class_announcement_id = ${classAnnouncements.id})::int`;

const CLASS_ANNOUNCEMENT_COLUMNS = {
  id: classAnnouncements.id,
  classSectionId: classAnnouncements.classSectionId,
  title: classAnnouncements.title,
  body: classAnnouncements.body,
  isPinned: classAnnouncements.isPinned,
  sendEmail: classAnnouncements.sendEmail,
  status: classAnnouncements.status,
  publishAt: classAnnouncements.publishAt,
  notifiedAt: classAnnouncements.notifiedAt,
  authorTitle: lecturers.title,
  authorName: lecturers.fullName,
  readCount,
};

export async function announcementRows(where: SQL): Promise<ClassAnnouncement[]> {
  const rows = await db
    .select(CLASS_ANNOUNCEMENT_COLUMNS)
    .from(classAnnouncements)
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .where(where)
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  const now = new Date();
  return rows.map(({ authorTitle, authorName, publishAt, notifiedAt, status, ...row }) => ({
    ...row,
    status: effectiveAnnouncementStatus(status, publishAt, now),
    publishAt: publishAt.toISOString(),
    notifiedAt: notifiedAt?.toISOString() ?? null,
    author: `${authorTitle} ${authorName}`,
  }));
}

const enrolledIn = (studentId: string) =>
  and(eq(enrollments.classSectionId, classSections.id), eq(enrollments.studentId, studentId), eq(enrollments.status, "enrolled"));

export async function studentAnnouncements(studentId: string, classSectionId?: string, executor: Executor = db): Promise<StudentClassAnnouncement[]> {
  if (!isUuid(studentId) || (classSectionId !== undefined && !isUuid(classSectionId))) return [];
  const rows = await executor
    .select({ ...CLASS_ANNOUNCEMENT_COLUMNS, classCode: classSections.code, courseName: courses.name, readAt: classAnnouncementReads.readAt })
    .from(classAnnouncements)
    .innerJoin(classSections, eq(classSections.id, classAnnouncements.classSectionId))
    .innerJoin(enrollments, enrolledIn(studentId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .leftJoin(classAnnouncementReads, and(eq(classAnnouncementReads.classAnnouncementId, classAnnouncements.id), eq(classAnnouncementReads.studentId, studentId)))
    .where(and(lte(classAnnouncements.publishAt, new Date()), classSectionId ? eq(classAnnouncements.classSectionId, classSectionId) : undefined))
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  return rows.map(({ authorTitle, authorName, publishAt, notifiedAt, readAt, ...row }) => ({
    ...row,
    status: "published",
    publishAt: publishAt.toISOString(),
    notifiedAt: notifiedAt?.toISOString() ?? null,
    author: `${authorTitle} ${authorName}`,
    isRead: readAt !== null,
  }));
}

const STUDENT_CLASS_COLUMNS = {
  id: classSections.id,
  code: classSections.code,
  courseCode: courses.code,
  courseName: courses.name,
  credits: courses.credits,
  termName: terms.name,
  lecturerTitle: lecturers.title,
  lecturerName: lecturers.fullName,
  lecturerEmail: lecturers.email,
  lecturerOffice: lecturers.office,
  lecturerOfficeHours: lecturers.officeHours,
};

async function studentClassRows(studentId: string, where: SQL | undefined, executor: Executor): Promise<StudentClass[]> {
  const rows = await executor
    .select(STUDENT_CLASS_COLUMNS)
    .from(classSections)
    .innerJoin(enrollments, enrolledIn(studentId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(terms, eq(terms.id, classSections.termId))
    .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
    .where(where)
    .orderBy(asc(classSections.code));
  if (rows.length === 0) return [];
  const counts = await executor
    .select({
      classSectionId: classAnnouncements.classSectionId,
      total: count(),
      unread: sql<number>`count(*) FILTER (WHERE ${classAnnouncementReads.studentId} IS NULL)::int`,
    })
    .from(classAnnouncements)
    .leftJoin(classAnnouncementReads, and(eq(classAnnouncementReads.classAnnouncementId, classAnnouncements.id), eq(classAnnouncementReads.studentId, studentId)))
    .where(
      and(
        lte(classAnnouncements.publishAt, new Date()),
        inArray(
          classAnnouncements.classSectionId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .groupBy(classAnnouncements.classSectionId);
  const countOf = new Map(counts.map((row) => [row.classSectionId, row]));
  return rows.map(({ lecturerTitle, lecturerName, lecturerEmail, lecturerOffice, lecturerOfficeHours, ...row }) => {
    const lecturer: ClassLecturer | null =
      lecturerName === null ? null : { displayName: `${lecturerTitle} ${lecturerName}`, email: lecturerEmail ?? "", office: lecturerOffice ?? "", officeHours: lecturerOfficeHours ?? "" };
    return { ...row, lecturer, announcementCount: countOf.get(row.id)?.total ?? 0, unreadCount: countOf.get(row.id)?.unread ?? 0 };
  });
}

export async function studentClasses(studentId: string, executor: Executor = db) {
  if (!isUuid(studentId)) return [];
  return studentClassRows(studentId, eq(terms.isCurrent, true), executor);
}

export async function studentClass(studentId: string, classSectionId: string, executor: Executor = db) {
  if (!isUuid(studentId) || !isUuid(classSectionId)) return null;
  const [row] = await studentClassRows(studentId, eq(classSections.id, classSectionId), executor);
  return row ?? null;
}

export async function lecturerClass(lecturerId: string, classSectionId: string) {
  if (!isUuid(lecturerId) || !isUuid(classSectionId)) return null;
  const [section] = await db
    .select({ id: classSections.id, code: classSections.code, courseCode: courses.code, courseName: courses.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(and(eq(classSections.id, classSectionId), eq(classSections.lecturerId, lecturerId)));
  return section ?? null;
}

export async function lecturerAnnouncements(lecturerId: string, classSectionId: string) {
  if (!(await lecturerClass(lecturerId, classSectionId))) return null;
  return announcementRows(eq(classAnnouncements.classSectionId, classSectionId));
}

export async function lecturerSyllabus(lecturerId: string, classSectionId: string) {
  if (!(await lecturerClass(lecturerId, classSectionId))) return null;
  return { syllabus: await readSyllabus(classSectionId) };
}

export async function studentSyllabus(studentId: string, classSectionId: string) {
  if (!(await studentClass(studentId, classSectionId))) return null;
  const syllabus = await readSyllabus(classSectionId);
  return syllabus?.status === "published" ? syllabus : null;
}

export async function recordAnnouncementRead(studentId: string, announcementId: string, executor: Executor = db) {
  if (!isUuid(studentId) || !isUuid(announcementId)) return false;
  const [announcement] = await executor
    .select({ id: classAnnouncements.id })
    .from(classAnnouncements)
    .innerJoin(classSections, eq(classSections.id, classAnnouncements.classSectionId))
    .innerJoin(enrollments, enrolledIn(studentId))
    .where(and(eq(classAnnouncements.id, announcementId), lte(classAnnouncements.publishAt, new Date())));
  if (!announcement) return false;
  await executor.insert(classAnnouncementReads).values({ classAnnouncementId: announcementId, studentId }).onConflictDoNothing();
  return true;
}

type AnnouncementToSend = { id: string; classSectionId: string; title: string; body: string; sendEmail: boolean };

export async function announceToClass(tx: Transaction, announcement: AnnouncementToSend) {
  const [section] = await tx
    .select({ code: classSections.code, courseName: courses.name, lecturerTitle: lecturers.title, lecturerName: lecturers.fullName })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
    .where(eq(classSections.id, announcement.classSectionId));
  const roster = await tx
    .select({ id: students.id, email: students.email })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classSectionId, announcement.classSectionId), eq(enrollments.status, "enrolled")));
  const href = classPageHref(announcement.classSectionId);
  const notified = await notifyStudents(
    tx,
    roster.map((student) => student.id),
    { kind: "announcement", title: `${section.code}: ${announcement.title}`, body: announcement.body, href },
  );
  await tx.update(classAnnouncements).set({ notifiedAt: new Date(), status: "published" }).where(eq(classAnnouncements.id, announcement.id));
  const author = section.lecturerName ? `${section.lecturerTitle} ${section.lecturerName}` : "Giảng viên";
  const mailIds = announcement.sendEmail
    ? await enqueueMail(tx, [
        {
          kind: "class-announcement",
          to: roster.map((student) => student.email),
          subject: `[${section.code}] ${announcement.title}`,
          text: `${announcement.body}\n\n${author}, lớp ${section.code} (${section.courseName}).\nXem trên cổng sinh viên: ${env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL}${href}`,
        },
      ])
    : [];
  return { students: roster.length, notified: notified.length, mailIds };
}

const DUE_BATCH = 50;

export async function publishDueClassAnnouncements(options: { classSectionId?: string } = {}) {
  const empty = { announcements: 0, notified: 0, emailed: 0, emailRetrying: 0, failed: 0 };
  if (options.classSectionId !== undefined && !isUuid(options.classSectionId)) return empty;
  const due = await db
    .select({ id: classAnnouncements.id })
    .from(classAnnouncements)
    .where(and(isNull(classAnnouncements.notifiedAt), lte(classAnnouncements.publishAt, new Date()), options.classSectionId ? eq(classAnnouncements.classSectionId, options.classSectionId) : undefined))
    .orderBy(asc(classAnnouncements.publishAt))
    .limit(DUE_BATCH);
  const results: Awaited<ReturnType<typeof announceToClass>>[] = [];
  let failed = 0;
  for (const { id } of due) {
    try {
      const result = await db.transaction(async (tx) => {
        const [announcement] = await tx
          .select({
            id: classAnnouncements.id,
            classSectionId: classAnnouncements.classSectionId,
            title: classAnnouncements.title,
            body: classAnnouncements.body,
            sendEmail: classAnnouncements.sendEmail,
          })
          .from(classAnnouncements)
          .where(and(eq(classAnnouncements.id, id), isNull(classAnnouncements.notifiedAt), lte(classAnnouncements.publishAt, new Date())))
          .for("update", { skipLocked: true });
        return announcement ? announceToClass(tx, announcement) : null;
      });
      if (result) results.push(result);
    } catch (error) {
      failed += 1;
      console.error(`Không báo được thông báo lớp ${id}`, error);
    }
  }
  const mail = await deliverQueuedMail(results.flatMap((result) => result.mailIds));
  return {
    announcements: results.length,
    notified: results.reduce((sum, result) => sum + result.notified, 0),
    emailed: mail.sent,
    emailRetrying: mail.retrying + mail.failed,
    failed,
  };
}

const describeGrading = (items: { label: string; weight: number }[]) => items.map((item) => `${item.label} ${item.weight}%`).join(", ");

export class SyllabusRevisionError extends Error {}

export async function writeSyllabus(
  tx: Transaction,
  section: { id: string; code: string; courseName: string },
  actor: AuditActor,
  data: z.output<typeof SYLLABUS_SCHEMA>,
) {
  const { description, references, outcomes, weeks, assessments, revisionNote } = data;
  const [current] = await tx.select({ id: syllabi.id, status: syllabi.status, version: syllabi.version }).from(syllabi).where(eq(syllabi.classSectionId, section.id)).for("update");
  const before = current
    ? await tx
        .select({ key: syllabusAssessments.key, label: syllabusAssessments.label, weight: syllabusAssessments.weight })
        .from(syllabusAssessments)
        .where(eq(syllabusAssessments.syllabusId, current.id))
        .orderBy(asc(syllabusAssessments.position))
    : [];
  const isRevision = current?.status === "published" && gradingChanged(before, assessments);
  if (isRevision && !revisionNote) {
    throw new SyllabusRevisionError("Đề cương đã công bố: đổi cách tính điểm phải ghi lý do. Bản mới thành phiên bản tiếp theo và sinh viên được thông báo.");
  }
  const [syllabus] = await tx
    .insert(syllabi)
    .values({ classSectionId: section.id, description, references })
    .onConflictDoUpdate({ target: syllabi.classSectionId, set: { description, references, updatedAt: new Date(), ...(isRevision ? { version: sql`${syllabi.version} + 1` } : {}) } })
    .returning({ id: syllabi.id, version: syllabi.version });
  if (isRevision && current) {
    await tx.insert(syllabusRevisions).values({ syllabusId: syllabus.id, version: current.version, assessments: before, note: revisionNote! });
  }
  await tx.delete(syllabusOutcomes).where(eq(syllabusOutcomes.syllabusId, syllabus.id));
  await tx.delete(syllabusWeeks).where(eq(syllabusWeeks.syllabusId, syllabus.id));
  await tx.delete(syllabusAssessments).where(eq(syllabusAssessments.syllabusId, syllabus.id));
  if (outcomes.length > 0) await tx.insert(syllabusOutcomes).values(outcomes.map((outcome, position) => ({ syllabusId: syllabus.id, ...outcome, position })));
  if (weeks.length > 0) await tx.insert(syllabusWeeks).values(weeks.map((week) => ({ syllabusId: syllabus.id, ...week })));
  if (assessments.length > 0) {
    await tx.insert(syllabusAssessments).values(assessments.map(({ outcomes: outcomeCodes, ...item }, position) => ({ syllabusId: syllabus.id, ...item, outcomeCodes, position })));
  }
  if (isRevision) {
    await recordAudit(tx, {
      actor,
      action: "update",
      entityType: "syllabus",
      entityId: syllabus.id,
      entityLabel: `${section.code} ${section.courseName}`,
      summary: `Đổi cách tính điểm đề cương ${section.code} lên phiên bản ${syllabus.version}: ${revisionNote}`,
      changes: [{ field: "Cách tính điểm", before: describeGrading(before), after: describeGrading(assessments) }],
    });
    const roster = await tx
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled")));
    await notifyStudents(
      tx,
      roster.map((row) => row.id),
      {
        kind: "announcement",
        title: `${section.code}: đề cương đổi cách tính điểm (phiên bản ${syllabus.version})`,
        body: `${describeGrading(assessments)}. Lý do: ${revisionNote}`,
        href: classPageHref(section.id),
      },
    );
  }
  return { id: syllabus.id, version: syllabus.version, isRevision };
}
