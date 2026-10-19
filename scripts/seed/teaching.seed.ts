import { and, asc, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { mockId } from "@/shared/libs/mock.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { CLASS_ANNOUNCEMENTS, SYLLABI } from "@/modules/teaching/teaching.mock";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusOutcomes, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import type { SeedContext } from "./context";

export const syllabusIdOf = (classSectionId: string) => mockId(`syllabus:${classSectionId}`);

// Đề cương (kèm chuẩn đầu ra, kế hoạch tuần, đánh giá), thông báo lớp và lượt đã đọc.
export async function seedTeaching(tx: Transaction, _context: SeedContext) {
  await tx.insert(syllabi).values(
    SYLLABI.map((syllabus) => ({
      id: syllabusIdOf(syllabus.classSectionId),
      classSectionId: syllabus.classSectionId,
      status: syllabus.status,
      description: syllabus.description,
      references: syllabus.references,
      publishedAt: syllabus.publishedAt ? new Date(syllabus.publishedAt) : null,
      updatedAt: new Date(syllabus.updatedAt),
    })),
  );
  await tx
    .insert(syllabusOutcomes)
    .values(SYLLABI.flatMap((syllabus) => syllabus.outcomes.map((outcome, position) => ({ syllabusId: syllabusIdOf(syllabus.classSectionId), ...outcome, position }))));
  await tx.insert(syllabusWeeks).values(SYLLABI.flatMap((syllabus) => syllabus.weeks.map((week) => ({ syllabusId: syllabusIdOf(syllabus.classSectionId), ...week }))));
  await tx.insert(syllabusAssessments).values(
    SYLLABI.flatMap((syllabus) =>
      syllabus.assessments.map(({ outcomes, ...item }, position) => ({ syllabusId: syllabusIdOf(syllabus.classSectionId), ...item, outcomeCodes: outcomes, position })),
    ),
  );

  // Người đăng là giảng viên dạy lớp đó.
  const sectionIds = [...new Set(CLASS_ANNOUNCEMENTS.map((announcement) => announcement.classSectionId))];
  const sections = await tx.select({ id: classSections.id, lecturerId: classSections.lecturerId }).from(classSections).where(inArray(classSections.id, sectionIds));
  const lecturerOf = new Map(sections.map((section) => [section.id, section.lecturerId!]));
  await tx.insert(classAnnouncements).values(
    CLASS_ANNOUNCEMENTS.map((announcement) => ({
      id: announcement.id,
      classSectionId: announcement.classSectionId,
      authorId: lecturerOf.get(announcement.classSectionId)!,
      title: announcement.title,
      body: announcement.body,
      isPinned: announcement.isPinned,
      sendEmail: announcement.sendEmail,
      status: announcement.status,
      publishAt: new Date(announcement.publishAt),
      notifiedAt: announcement.notifiedAt ? new Date(announcement.notifiedAt) : null,
      createdAt: new Date(announcement.publishAt),
    })),
  );

  // Số lượt đã đọc của dữ liệu mẫu: lấy đủ số sinh viên đầu danh sách lớp, đọc sau khi đăng vài giờ.
  const reads: (typeof classAnnouncementReads.$inferInsert)[] = [];
  for (const announcement of CLASS_ANNOUNCEMENTS) {
    if (announcement.readCount === 0) continue;
    const roster = await tx
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classSectionId, announcement.classSectionId), eq(enrollments.status, "enrolled")))
      .orderBy(asc(enrollments.registeredAt), asc(enrollments.id))
      .limit(announcement.readCount);
    roster.forEach(({ studentId }, index) =>
      reads.push({ classAnnouncementId: announcement.id, studentId, readAt: new Date(new Date(announcement.publishAt).getTime() + (index + 1) * 17 * 60_000) }),
    );
  }
  if (reads.length > 0) await tx.insert(classAnnouncementReads).values(reads);

  return { syllabi: SYLLABI.length, announcements: CLASS_ANNOUNCEMENTS.length, reads: reads.length };
}
