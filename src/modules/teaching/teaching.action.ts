"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { deliverMailSoon } from "@/modules/mail/mail.lib";
import { TEACHING_CONSTRAINT_MESSAGE } from "@/modules/teaching/teaching.constant";
import { announceToClass, classPageHref, recordAnnouncementRead, writeSyllabus, SyllabusRevisionError } from "@/modules/teaching/teaching.lib";
import { getClassAnnouncement, getSyllabus } from "@/modules/teaching/teaching.query";
import { assessmentTotal, CLASS_ANNOUNCEMENT_SCHEMA, SYLLABUS_SCHEMA, type ClassAnnouncementInput, type SyllabusInput } from "@/modules/teaching/teaching.rule";
import { classAnnouncements, syllabi, syllabusAssessments } from "@/modules/teaching/teaching.schema";
import type { ClassAnnouncement, Syllabus } from "@/modules/teaching/teaching.type";
import { requireSession } from "@/modules/authentication/authentication.query";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";

const NOT_YOUR_CLASS = "Bạn không phải giảng viên dạy lớp này nên không sửa được.";

class AlreadyAnnouncedError extends Error {}

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

function revalidateClass(classSectionId: string) {
  revalidatePath(`/lecturer/classes/${classSectionId}`, "layout");
  revalidatePath(classPageHref(classSectionId));
}

// Lưu đề cương. Đề cương đã công bố mà đổi cách tính điểm (hình thức, trọng số) phải ghi lý do: lưu thành phiên bản mới, bản cũ
// giữ lại, sinh viên của lớp nhận thông báo.
export async function saveSyllabus(input: SyllabusInput): Promise<ActionResult<Syllabus>> {
  const section = await sectionOfLecturer(typeof input?.classSectionId === "string" ? input.classSectionId : "");
  if (!section) return actionError(NOT_YOUR_CLASS);
  const parsed = parseInput(SYLLABUS_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const [lecturer, { user }] = await Promise.all([getCurrentLecturer(), requireSession()]);
  try {
    await db.transaction((tx) => writeSyllabus(tx, section, { userId: user.id, name: lecturer.displayName, role: "Giảng viên" }, parsed.data));
  } catch (error) {
    if (error instanceof SyllabusRevisionError) return actionError(error.message, { revisionNote: error.message });
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
  revalidateClass(section.id);
  const syllabus = await getSyllabus(section.id, section);
  return syllabus ? actionOk(syllabus) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
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
  const syllabus = await getSyllabus(section.id, section);
  return syllabus ? actionOk(syllabus) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

export async function saveClassAnnouncement(id: string | null, input: ClassAnnouncementInput): Promise<ActionResult<ClassAnnouncement>> {
  const section = await sectionOfLecturer(typeof input?.classSectionId === "string" ? input.classSectionId : "");
  if (!section) return actionError(NOT_YOUR_CLASS);
  if (id !== null && !isUuid(id)) return actionError("Thông báo không còn tồn tại, tải lại trang.");
  const parsed = parseInput(CLASS_ANNOUNCEMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { schedule, publishAt, classSectionId: _classSectionId, ...values } = parsed.data;
  let saved: { id: string; mailIds: string[] } | null;
  try {
    saved = await db.transaction(async (tx) => {
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
        // Bài hẹn giờ chờ tác vụ class-announcements báo khi tới giờ.
        const announced = schedule ? null : await announceToClass(tx, { id: row.id, classSectionId: section.id, ...values });
        return { id: row.id, mailIds: announced?.mailIds ?? [] };
      }
      // Khóa dòng để không chạy song song với tác vụ báo bài hẹn giờ (tác vụ bỏ qua dòng đang bị khóa).
      const [current] = await tx
        .select({ publishAt: classAnnouncements.publishAt, notifiedAt: classAnnouncements.notifiedAt })
        .from(classAnnouncements)
        .where(and(eq(classAnnouncements.id, id), eq(classAnnouncements.classSectionId, section.id)))
        .for("update");
      if (!current) return null;
      // Bài đã tới giờ đăng thì sinh viên đã thấy (kể cả khi tác vụ nền chưa kịp báo): không hẹn giờ lại về tương lai, để bài
      // không biến mất khỏi trang lớp của sinh viên.
      const isDue = current.publishAt.getTime() <= Date.now();
      if (schedule && (current.notifiedAt || isDue)) throw new AlreadyAnnouncedError();
      // Sửa bài đã đăng thì giữ thời điểm đăng cũ; bỏ hẹn giờ thì đăng ngay.
      await tx
        .update(classAnnouncements)
        .set({
          ...values,
          status: schedule ? "scheduled" : "published",
          publishAt: schedule && publishAt ? new Date(publishAt) : isDue ? current.publishAt : new Date(),
        })
        .where(eq(classAnnouncements.id, id));
      // Bài đã báo thì sửa không báo lại; bài chưa báo mà giờ đăng ngay (bỏ hẹn giờ, hoặc đã quá giờ hẹn) thì báo như đăng mới.
      const announced = !schedule && !current.notifiedAt ? await announceToClass(tx, { id, classSectionId: section.id, ...values }) : null;
      return { id, mailIds: announced?.mailIds ?? [] };
    });
  } catch (error) {
    if (error instanceof AlreadyAnnouncedError) return actionError("Thông báo đã tới giờ đăng, sinh viên đã thấy nên không hẹn giờ lại được. Tắt Hẹn giờ đăng để lưu nội dung sửa.", { schedule: "Bài đã đăng không hẹn giờ lại được" });
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
  if (!saved) return actionError("Thông báo không còn tồn tại, tải lại trang.");
  // Thư đã xếp hàng cùng bài đăng; gửi sau khi đã trả kết quả để giảng viên không phải chờ gửi cho cả lớp.
  deliverMailSoon(saved.mailIds);
  revalidateClass(section.id);
  const announcement = await getClassAnnouncement(saved.id);
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
    if (!(await recordAnnouncementRead(student.id, id))) return actionError("Thông báo không thuộc lớp bạn đang học.");
    return actionOk();
  } catch (error) {
    return actionFailure(error, TEACHING_CONSTRAINT_MESSAGE);
  }
}
