import "server-only";
import { and, asc, count, desc, eq, isNull, lte, type SQL } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { sendMailEach } from "@/shared/libs/mail.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { SYLLABUS_WEEKS } from "@/modules/teaching/teaching.constant";
import { effectiveAnnouncementStatus } from "@/modules/teaching/teaching.rule";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusOutcomes, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, ClassLecturer, StudentClass, StudentClassAnnouncement, Syllabus, SyllabusWeek } from "@/modules/teaching/teaching.type";
import { lecturers, students } from "@/modules/users/users.schema";

// Hàm không kiểm phiên: chỉ query/action/route của module gọi sau khi đã xác định người dùng (hoặc tác vụ nền, test).
// Nhận executor để test chạy trong transaction rồi rollback.
type Executor = Transaction | typeof db;

export const classPageHref = (classSectionId: string) => `/application/classes/${classSectionId}`;

const blankWeek = (week: number): SyllabusWeek => ({ week, topic: "", activities: "", readings: "" });

// Kế hoạch luôn đủ 15 tuần để form soạn có sẵn từng dòng; tuần chưa lưu là dòng trống.
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
      description: syllabi.description,
      references: syllabi.references,
    })
    .from(syllabi)
    .innerJoin(classSections, eq(classSections.id, syllabi.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(eq(syllabi.classSectionId, classSectionId));
  if (!row) return null;
  const [outcomes, weeks, assessments] = await Promise.all([
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
  ]);
  const { id: _id, publishedAt, updatedAt, ...rest } = row;
  return {
    ...rest,
    publishedAt: publishedAt?.toISOString() ?? null,
    updatedAt: updatedAt.toISOString(),
    outcomes,
    weeks: fillWeeks(weeks),
    assessments,
  };
}

const readCount = db
  .select({ announcementId: classAnnouncementReads.classAnnouncementId, total: count().as("total") })
  .from(classAnnouncementReads)
  .groupBy(classAnnouncementReads.classAnnouncementId)
  .as("read_count");

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
  readCount: readCount.total,
};

export async function announcementRows(where: SQL): Promise<ClassAnnouncement[]> {
  const rows = await db
    .select(CLASS_ANNOUNCEMENT_COLUMNS)
    .from(classAnnouncements)
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .leftJoin(readCount, eq(readCount.announcementId, classAnnouncements.id))
    .where(where)
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  const now = new Date();
  return rows.map(({ authorTitle, authorName, publishAt, notifiedAt, status, readCount: reads, ...row }) => ({
    ...row,
    status: effectiveAnnouncementStatus(status, publishAt, now),
    publishAt: publishAt.toISOString(),
    notifiedAt: notifiedAt?.toISOString() ?? null,
    author: `${authorTitle} ${authorName}`,
    readCount: reads ?? 0,
  }));
}

// Điều kiện "sinh viên đang học lớp": chỉ đăng ký còn hiệu lực, đã hủy hay rút thì không còn xem lớp.
const enrolledIn = (studentId: string) =>
  and(eq(enrollments.classSectionId, classSections.id), eq(enrollments.studentId, studentId), eq(enrollments.status, "enrolled"));

// Thông báo đã tới giờ đăng của các lớp sinh viên đang học, kèm đã đọc hay chưa; truyền classSectionId để lấy một lớp.
export async function studentAnnouncements(studentId: string, classSectionId?: string, executor: Executor = db): Promise<StudentClassAnnouncement[]> {
  if (!isUuid(studentId) || (classSectionId !== undefined && !isUuid(classSectionId))) return [];
  const rows = await executor
    .select({ ...CLASS_ANNOUNCEMENT_COLUMNS, classCode: classSections.code, courseName: courses.name, readAt: classAnnouncementReads.readAt })
    .from(classAnnouncements)
    .innerJoin(classSections, eq(classSections.id, classAnnouncements.classSectionId))
    .innerJoin(enrollments, enrolledIn(studentId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .leftJoin(readCount, eq(readCount.announcementId, classAnnouncements.id))
    .leftJoin(classAnnouncementReads, and(eq(classAnnouncementReads.classAnnouncementId, classAnnouncements.id), eq(classAnnouncementReads.studentId, studentId)))
    .where(and(lte(classAnnouncements.publishAt, new Date()), classSectionId ? eq(classAnnouncements.classSectionId, classSectionId) : undefined))
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  return rows.map(({ authorTitle, authorName, publishAt, notifiedAt, readAt, readCount: reads, ...row }) => ({
    ...row,
    status: "published",
    publishAt: publishAt.toISOString(),
    notifiedAt: notifiedAt?.toISOString() ?? null,
    author: `${authorTitle} ${authorName}`,
    readCount: reads ?? 0,
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
  const announcements = await studentAnnouncements(studentId, undefined, executor);
  return rows.map(({ lecturerTitle, lecturerName, lecturerEmail, lecturerOffice, lecturerOfficeHours, ...row }) => {
    const own = announcements.filter((announcement) => announcement.classSectionId === row.id);
    const lecturer: ClassLecturer | null =
      lecturerName === null ? null : { displayName: `${lecturerTitle} ${lecturerName}`, email: lecturerEmail ?? "", office: lecturerOffice ?? "", officeHours: lecturerOfficeHours ?? "" };
    return { ...row, lecturer, announcementCount: own.length, unreadCount: own.filter((announcement) => !announcement.isRead).length };
  });
}

// Lớp học phần sinh viên đang học trong học kỳ hiện tại.
export async function studentClasses(studentId: string, executor: Executor = db) {
  if (!isUuid(studentId)) return [];
  return studentClassRows(studentId, eq(terms.isCurrent, true), executor);
}

// Một lớp của sinh viên; không đang học lớp đó thì null (trang trả 404, không lộ lớp có tồn tại hay không).
export async function studentClass(studentId: string, classSectionId: string, executor: Executor = db) {
  if (!isUuid(studentId) || !isUuid(classSectionId)) return null;
  const [row] = await studentClassRows(studentId, eq(classSections.id, classSectionId), executor);
  return row ?? null;
}

// Lớp do giảng viên này dạy; không dạy thì null. Giảng viên khác không xem được bài hẹn giờ hay đề cương nháp của lớp.
export async function lecturerClass(lecturerId: string, classSectionId: string) {
  if (!isUuid(lecturerId) || !isUuid(classSectionId)) return null;
  const [section] = await db
    .select({ id: classSections.id, code: classSections.code, courseCode: courses.code, courseName: courses.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(and(eq(classSections.id, classSectionId), eq(classSections.lecturerId, lecturerId)));
  return section ?? null;
}

// Mọi thông báo của lớp (kể cả hẹn giờ chưa tới giờ) cho giảng viên dạy lớp; không dạy thì null.
export async function lecturerAnnouncements(lecturerId: string, classSectionId: string) {
  if (!(await lecturerClass(lecturerId, classSectionId))) return null;
  return announcementRows(eq(classAnnouncements.classSectionId, classSectionId));
}

// Đề cương (cả bản nháp) cho giảng viên dạy lớp: { syllabus: null } là lớp chưa có đề cương; không dạy thì null.
export async function lecturerSyllabus(lecturerId: string, classSectionId: string) {
  if (!(await lecturerClass(lecturerId, classSectionId))) return null;
  return { syllabus: await readSyllabus(classSectionId) };
}

// Đề cương cho sinh viên: chỉ khi đang học lớp và giảng viên đã công bố.
export async function studentSyllabus(studentId: string, classSectionId: string) {
  if (!(await studentClass(studentId, classSectionId))) return null;
  const syllabus = await readSyllabus(classSectionId);
  return syllabus?.status === "published" ? syllabus : null;
}

// Ghi nhận sinh viên đã đọc; trả false nếu thông báo không thuộc lớp sinh viên đang học hoặc chưa tới giờ đăng.
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

export type ClassMail = { recipients: string[]; subject: string; text: string };

type AnnouncementToSend = { id: string; classSectionId: string; title: string; body: string; sendEmail: boolean };

// Báo bài đăng tới sinh viên đang học lớp: ghi thông báo trên cổng và notified_at trong cùng transaction.
// Email không gửi trong transaction (gọi mạng khi đang giữ khóa dòng); trả về thư để nơi gọi gửi sau khi commit.
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
  const mail: ClassMail | null =
    announcement.sendEmail && roster.length > 0
      ? {
          recipients: roster.map((student) => student.email),
          subject: `[${section.code}] ${announcement.title}`,
          text: `${announcement.body}\n\n${author}, lớp ${section.code} (${section.courseName}).\nXem trên cổng sinh viên: ${env.DEFEAT_BETTER_AUTH_PUBLIC_APPLICATION_BASE_URL}${href}`,
        }
      : null;
  return { students: roster.length, notified: notified.length, mail };
}

export async function sendClassMails(mails: (ClassMail | null)[]) {
  let sent = 0;
  let failed = 0;
  for (const mail of mails) {
    if (!mail) continue;
    const result = await sendMailEach(mail.recipients, { subject: mail.subject, text: mail.text });
    sent += result.sent;
    failed += result.failed;
  }
  return { sent, failed };
}

// Mỗi lần chạy báo tối đa ngần này bài; còn thì lần chạy sau báo tiếp.
const DUE_BATCH = 50;

// Báo các bài đã tới giờ đăng mà chưa báo. Khóa dòng FOR UPDATE SKIP LOCKED: hai lần chạy song song (cron và trang lớp gọi bù)
// không lấy trùng bài, bài đang bị lần chạy kia hoặc giảng viên đang sửa giữ khóa thì bỏ qua cho lần sau.
export async function publishDueClassAnnouncements(options: { classSectionId?: string } = {}) {
  if (options.classSectionId !== undefined && !isUuid(options.classSectionId)) return { announcements: 0, notified: 0, emailed: 0, emailFailed: 0 };
  const results = await db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: classAnnouncements.id,
        classSectionId: classAnnouncements.classSectionId,
        title: classAnnouncements.title,
        body: classAnnouncements.body,
        sendEmail: classAnnouncements.sendEmail,
      })
      .from(classAnnouncements)
      .where(
        and(
          isNull(classAnnouncements.notifiedAt),
          lte(classAnnouncements.publishAt, new Date()),
          options.classSectionId ? eq(classAnnouncements.classSectionId, options.classSectionId) : undefined,
        ),
      )
      .orderBy(asc(classAnnouncements.publishAt))
      .limit(DUE_BATCH)
      .for("update", { skipLocked: true });
    const done = [];
    for (const announcement of due) done.push(await announceToClass(tx, announcement));
    return done;
  });
  const mail = await sendClassMails(results.map((result) => result.mail));
  return {
    announcements: results.length,
    notified: results.reduce((sum, result) => sum + result.notified, 0),
    emailed: mail.sent,
    emailFailed: mail.failed,
  };
}
