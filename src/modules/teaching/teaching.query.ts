import "server-only";
import { and, asc, count, desc, eq, lte, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { SYLLABUS_WEEKS } from "@/modules/teaching/teaching.constant";
import { effectiveAnnouncementStatus } from "@/modules/teaching/teaching.rule";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusOutcomes, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, StudentClassAnnouncement, Syllabus, SyllabusWeek } from "@/modules/teaching/teaching.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { lecturers } from "@/modules/users/users.schema";

const blankWeek = (week: number): SyllabusWeek => ({ week, topic: "", activities: "", readings: "" });

// Kế hoạch luôn đủ 15 tuần để form soạn có sẵn từng dòng; tuần chưa lưu là dòng trống.
function fillWeeks(weeks: SyllabusWeek[]) {
  const total = Math.max(SYLLABUS_WEEKS, ...weeks.map((week) => week.week));
  const byWeek = new Map(weeks.map((week) => [week.week, week]));
  return Array.from({ length: total }, (_, index) => byWeek.get(index + 1) ?? blankWeek(index + 1));
}

async function readSyllabus(classSectionId: string): Promise<Syllabus | null> {
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

export async function getSyllabus(classSectionId: string, fallback: { courseCode: string; courseName: string }): Promise<Syllabus> {
  await requireSession();
  const syllabus = isUuid(classSectionId) ? await readSyllabus(classSectionId) : null;
  return (
    syllabus ?? {
      classSectionId,
      courseCode: fallback.courseCode,
      courseName: fallback.courseName,
      status: "draft",
      publishedAt: null,
      updatedAt: new Date().toISOString(),
      description: "",
      outcomes: [],
      weeks: fillWeeks([]),
      assessments: [],
      references: [],
    }
  );
}

const readCount = db
  .select({ announcementId: classAnnouncementReads.classAnnouncementId, total: count().as("total") })
  .from(classAnnouncementReads)
  .groupBy(classAnnouncementReads.classAnnouncementId)
  .as("read_count");

export const CLASS_ANNOUNCEMENT_COLUMNS = {
  id: classAnnouncements.id,
  classSectionId: classAnnouncements.classSectionId,
  title: classAnnouncements.title,
  body: classAnnouncements.body,
  isPinned: classAnnouncements.isPinned,
  sendEmail: classAnnouncements.sendEmail,
  status: classAnnouncements.status,
  publishAt: classAnnouncements.publishAt,
  authorTitle: lecturers.title,
  authorName: lecturers.fullName,
  readCount: readCount.total,
};

async function announcementRows(where: SQL): Promise<ClassAnnouncement[]> {
  const rows = await db
    .select(CLASS_ANNOUNCEMENT_COLUMNS)
    .from(classAnnouncements)
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .leftJoin(readCount, eq(readCount.announcementId, classAnnouncements.id))
    .where(where)
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  const now = new Date();
  return rows.map(({ authorTitle, authorName, publishAt, status, readCount: reads, ...row }) => ({
    ...row,
    status: effectiveAnnouncementStatus(status, publishAt, now),
    publishAt: publishAt.toISOString(),
    author: `${authorTitle} ${authorName}`,
    readCount: reads ?? 0,
  }));
}

export async function getClassAnnouncements(classSectionId: string) {
  await requireSession();
  if (!isUuid(classSectionId)) return [];
  return announcementRows(eq(classAnnouncements.classSectionId, classSectionId));
}

export async function getClassAnnouncement(id: string) {
  await requireSession();
  if (!isUuid(id)) return null;
  const [announcement] = await announcementRows(eq(classAnnouncements.id, id));
  return announcement ?? null;
}

// Thông báo đã tới giờ đăng của các lớp sinh viên đang học, kèm đã đọc hay chưa.
export async function getMyClassAnnouncements(): Promise<StudentClassAnnouncement[]> {
  const student = await getCurrentStudent();
  const rows = await db
    .select({ ...CLASS_ANNOUNCEMENT_COLUMNS, classCode: classSections.code, courseName: courses.name, readAt: classAnnouncementReads.readAt })
    .from(classAnnouncements)
    .innerJoin(enrollments, and(eq(enrollments.classSectionId, classAnnouncements.classSectionId), eq(enrollments.studentId, student.id), eq(enrollments.status, "enrolled")))
    .innerJoin(classSections, eq(classSections.id, classAnnouncements.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(lecturers, eq(lecturers.id, classAnnouncements.authorId))
    .leftJoin(readCount, eq(readCount.announcementId, classAnnouncements.id))
    .leftJoin(classAnnouncementReads, and(eq(classAnnouncementReads.classAnnouncementId, classAnnouncements.id), eq(classAnnouncementReads.studentId, student.id)))
    .where(lte(classAnnouncements.publishAt, new Date()))
    .orderBy(desc(classAnnouncements.isPinned), desc(classAnnouncements.publishAt));
  return rows.map(({ authorTitle, authorName, publishAt, readAt, readCount: reads, ...row }) => ({
    ...row,
    status: "published",
    publishAt: publishAt.toISOString(),
    author: `${authorTitle} ${authorName}`,
    readCount: reads ?? 0,
    isRead: readAt !== null,
  }));
}
