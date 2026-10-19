"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { TEACHING_CONSTRAINT_MESSAGE } from "@/modules/teaching/teaching.constant";
import { getClassAnnouncement, getSyllabus } from "@/modules/teaching/teaching.query";
import { assessmentTotal, CLASS_ANNOUNCEMENT_SCHEMA, SYLLABUS_SCHEMA, type ClassAnnouncementInput, type SyllabusInput } from "@/modules/teaching/teaching.rule";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusOutcomes, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, Syllabus } from "@/modules/teaching/teaching.type";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";

const NOT_YOUR_CLASS = "Bạn không phải giảng viên dạy lớp này nên không sửa được.";

// Chỉ giảng viên được phân công dạy lớp mới soạn đề cương và đăng thông báo cho lớp đó.
async function sectionOfLecturer(classSectionId: string) {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(classSectionId)) return null;
  const [section] = await db
    .select({ id: classSections.id, code: classSections.code, courseCode: courses.code, courseName: courses.name })
    .from(classSections)
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .where(and(eq(classSections.id, classSectionId), eq(classSections.lecturerId, lecturer.id)));
  return section ? { ...section, lecturerId: lecturer.id } : null;
}

// Báo sinh viên đang học lớp lúc thông báo được đăng. Cổng sinh viên chưa có trang thông báo lớp nên nội dung nằm luôn trong thông báo.
// Thông báo hẹn giờ không báo: chưa có job chạy nền để gửi đúng giờ đăng. Cột sendEmail chỉ được lưu, chưa có dịch vụ email.
async function notifyClass(tx: Transaction, section: { id: string; code: string }, announcement: { title: string; body: string }) {
  const enrolled = await tx
    .select({ studentId: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.classSectionId, section.id), eq(enrollments.status, "enrolled")));
  await notifyStudents(
    tx,
    enrolled.map((row) => row.studentId),
    {
      kind: "announcement",
      title: `${section.code}: ${announcement.title}`,
      body: announcement.body,
      href: "/application/notifications",
    },
  );
}

function revalidateClass(classSectionId: string) {
  revalidatePath(`/lecturer/classes/${classSectionId}`, "layout");
}

export async function saveSyllabus(input: SyllabusInput): Promise<ActionResult<Syllabus>> {
  const section = await sectionOfLecturer(typeof input?.classSectionId === "string" ? input.classSectionId : "");
  if (!section) return actionError(NOT_YOUR_CLASS);
  const parsed = parseInput(SYLLABUS_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { description, references, outcomes, weeks, assessments } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [syllabus] = await tx
        .insert(syllabi)
        .values({ classSectionId: section.id, description, references })
        .onConflictDoUpdate({ target: syllabi.classSectionId, set: { description, references, updatedAt: new Date() } })
        .returning({ id: syllabi.id });
      // Ghi lại toàn bộ phần con: trigger kiểm tổng trọng số chạy lúc commit nên xóa rồi chèn trong cùng giao dịch được.
      await tx.delete(syllabusOutcomes).where(eq(syllabusOutcomes.syllabusId, syllabus.id));
      await tx.delete(syllabusWeeks).where(eq(syllabusWeeks.syllabusId, syllabus.id));
      await tx.delete(syllabusAssessments).where(eq(syllabusAssessments.syllabusId, syllabus.id));
      if (outcomes.length > 0) await tx.insert(syllabusOutcomes).values(outcomes.map((outcome, position) => ({ syllabusId: syllabus.id, ...outcome, position })));
      if (weeks.length > 0) await tx.insert(syllabusWeeks).values(weeks.map((week) => ({ syllabusId: syllabus.id, ...week })));
      if (assessments.length > 0) {
        await tx
          .insert(syllabusAssessments)
          .values(assessments.map(({ outcomes: outcomeCodes, ...item }, position) => ({ syllabusId: syllabus.id, ...item, outcomeCodes, position })));
      }
    });
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
  revalidateClass(section.id);
  return actionOk(await getSyllabus(section.id, section));
}

export async function publishSyllabus(classSectionId: string): Promise<ActionResult<Syllabus>> {
  const section = await sectionOfLecturer(classSectionId);
  if (!section) return actionError(NOT_YOUR_CLASS);
  try {
    const [syllabus] = await db.select({ id: syllabi.id, status: syllabi.status }).from(syllabi).where(eq(syllabi.classSectionId, section.id));
    if (!syllabus) return actionError("Lớp chưa có đề cương. Soạn và lưu đề cương trước khi công bố.");
    if (syllabus.status === "published") return actionError("Đề cương đã được công bố trước đó.");
    const weights = await db.select({ weight: syllabusAssessments.weight }).from(syllabusAssessments).where(eq(syllabusAssessments.syllabusId, syllabus.id));
    const total = assessmentTotal(weights);
    if (total !== 100) return actionError(`Tổng trọng số đánh giá đang là ${total}%, cần đúng 100% mới công bố được.`);
    await db
      .update(syllabi)
      .set({ status: "published", publishedAt: new Date() })
      .where(and(eq(syllabi.id, syllabus.id), eq(syllabi.status, "draft")));
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
  revalidateClass(section.id);
  return actionOk(await getSyllabus(section.id, section));
}

export async function saveClassAnnouncement(id: string | null, input: ClassAnnouncementInput): Promise<ActionResult<ClassAnnouncement>> {
  const section = await sectionOfLecturer(typeof input?.classSectionId === "string" ? input.classSectionId : "");
  if (!section) return actionError(NOT_YOUR_CLASS);
  if (id !== null && !isUuid(id)) return actionError("Thông báo không còn tồn tại, tải lại trang.");
  const parsed = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { schedule, publishAt, classSectionId: _classSectionId, ...values } = parsed.data;
  let savedId: string | null;
  try {
    savedId = await db.transaction(async (tx) => {
      if (id === null) {
        const [row] = await tx
          .insert(classAnnouncements)
          .values({
            ...values,
            classSectionId: section.id,
            authorId: section.lecturerId,
            status: schedule ? "scheduled" : "published",
            publishAt: schedule && publishAt ? new Date(publishAt) : new Date(),
          })
          .returning({ id: classAnnouncements.id });
        if (!schedule) await notifyClass(tx, section, values);
        return row.id;
      }
      const [current] = await tx
        .select({ status: classAnnouncements.status, publishAt: classAnnouncements.publishAt })
        .from(classAnnouncements)
        .where(and(eq(classAnnouncements.id, id), eq(classAnnouncements.classSectionId, section.id)))
        .for("update");
      if (!current) return null;
      // Sửa thông báo đã đăng thì giữ thời điểm đăng cũ; bỏ hẹn giờ thì đăng ngay.
      const alreadyPublished = current.status === "published" || current.publishAt.getTime() <= Date.now();
      await tx
        .update(classAnnouncements)
        .set({
          ...values,
          status: schedule ? "scheduled" : "published",
          publishAt: schedule && publishAt ? new Date(publishAt) : alreadyPublished ? current.publishAt : new Date(),
        })
        .where(eq(classAnnouncements.id, id));
      // Bỏ hẹn giờ để đăng ngay thì báo như đăng mới; sửa thông báo đã đăng thì không báo lại.
      if (!schedule && !alreadyPublished) await notifyClass(tx, section, values);
      return id;
    });
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
  if (!savedId) return actionError("Thông báo không còn tồn tại, tải lại trang.");
  revalidateClass(section.id);
  const announcement = await getClassAnnouncement(savedId);
  return announcement ? actionOk(announcement) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function deleteClassAnnouncement(id: string): Promise<ActionResult<{ id: string }>> {
  const lecturer = await getCurrentLecturer();
  if (!isUuid(id)) return actionError("Thông báo không còn tồn tại, tải lại trang.");
  try {
    const [row] = await db
      .select({ classSectionId: classAnnouncements.classSectionId, lecturerId: classSections.lecturerId })
      .from(classAnnouncements)
      .innerJoin(classSections, eq(classSections.id, classAnnouncements.classSectionId))
      .where(eq(classAnnouncements.id, id));
    if (!row) return actionError("Thông báo đã được xóa trước đó.");
    if (row.lecturerId !== lecturer.id) return actionError(NOT_YOUR_CLASS);
    await db.delete(classAnnouncements).where(eq(classAnnouncements.id, id));
    revalidateClass(row.classSectionId);
    return actionOk({ id });
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
}

// Sinh viên mở thông báo của lớp mình đang học thì ghi nhận đã đọc; đọc lại không ghi thêm.
export async function markClassAnnouncementRead(id: string): Promise<ActionResult> {
  const student = await getCurrentStudent();
  if (!isUuid(id)) return actionError("Thông báo không còn tồn tại.");
  try {
    const [announcement] = await db
      .select({ id: classAnnouncements.id, publishAt: classAnnouncements.publishAt })
      .from(classAnnouncements)
      .innerJoin(enrollments, and(eq(enrollments.classSectionId, classAnnouncements.classSectionId), eq(enrollments.studentId, student.id), eq(enrollments.status, "enrolled")))
      .where(eq(classAnnouncements.id, id));
    if (!announcement || announcement.publishAt.getTime() > Date.now()) return actionError("Thông báo không thuộc lớp bạn đang học.");
    await db.insert(classAnnouncementReads).values({ classAnnouncementId: id, studentId: student.id }).onConflictDoNothing();
    return actionOk();
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
}
