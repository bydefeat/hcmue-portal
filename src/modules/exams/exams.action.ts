"use server";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { newId } from "@/shared/libs/id.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { EXAMS_CONSTRAINT_MESSAGE } from "@/modules/exams/exams.constant";
import { getExamSession } from "@/modules/exams/exams.query";
import {
  ELIGIBILITY_OVERRIDE_SCHEMA,
  EXAM_PAPER_SUBMIT_SCHEMA,
  EXAM_PUBLISH_SCHEMA,
  EXAM_SESSION_UPDATE_SCHEMA,
  examPaperStorageKey,
  PROCTOR_SWAP_SCHEMA,
  type EligibilityOverrideInput,
  type ExamPaperSubmitInput,
  type ExamPublishInput,
  type ExamSessionUpdateInput,
  type ProctorSwapInput,
} from "@/modules/exams/exams.rule";
import { examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import type { ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { rooms } from "@/modules/facilities/facilities.schema";
import { lecturers } from "@/modules/users/users.schema";
import { getCurrentLecturer } from "@/modules/users/users.query";

class InputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function failure(error: unknown) {
  if (error instanceof InputError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, EXAMS_CONSTRAINT_MESSAGE);
}

function revalidateExams() {
  revalidatePath("/administrator/exams");
  revalidatePath("/lecturer/exams");
  revalidatePath("/application/exams");
}

// Phòng Khảo thí sửa ngày, giờ, phòng, hình thức và cán bộ coi thi của một ca chưa thi, trong phạm vi khoa được phân quyền.
export async function updateExamSession(input: ExamSessionUpdateInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_SESSION_UPDATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id, proctorIds, roomId, ...values } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [exam] = await tx
        .select({ status: examSessions.status, faculty: faculties.name, termStart: terms.startDate, termEnd: terms.endDate })
        .from(examSessions)
        .innerJoin(terms, eq(terms.id, examSessions.termId))
        .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
        .innerJoin(courses, eq(courses.id, classSections.courseId))
        .innerJoin(faculties, eq(faculties.id, courses.facultyId))
        .where(eq(examSessions.id, id))
        .for("update", { of: examSessions });
      if (!exam || !inScope(viewer, exam.faculty)) throw new InputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
      if (exam.status === "done") throw new InputError("Ca thi đã diễn ra, không sửa được nữa.");
      if (values.date < exam.termStart || values.date > exam.termEnd) throw new InputError("Ngày thi phải nằm trong học kỳ", "date");
      const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, roomId));
      if (!room) throw new InputError("Phòng không còn trong danh mục", "roomId");
      if (room.status !== "active") throw new InputError("Phòng đang bảo trì, chọn phòng khác", "roomId");
      const people = await tx.select({ id: lecturers.id }).from(lecturers).where(and(inArray(lecturers.id, proctorIds), eq(lecturers.status, "active")));
      if (people.length !== proctorIds.length) throw new InputError("Có cán bộ coi thi không còn công tác", "proctorIds");

      await tx.update(examSessions).set({ ...values, roomId }).where(eq(examSessions.id, id));
      // Chỉ bỏ người bị thay; người giữ nguyên vẫn còn đề nghị đổi ca (nếu có) đang chờ.
      await tx.delete(examProctors).where(and(eq(examProctors.examSessionId, id), notInArray(examProctors.lecturerId, proctorIds)));
      await tx
        .insert(examProctors)
        .values(proctorIds.map((lecturerId) => ({ examSessionId: id, lecturerId })))
        .onConflictDoNothing();
    });
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  const exam = await getExamSession(id);
  if (!exam) return actionError("Ca thi không còn trong lịch, tải lại trang.");
  return actionOk(exam);
}

// Công bố mọi ca dự kiến cùng loại (giữa kỳ hoặc cuối kỳ) của học kỳ trong phạm vi khoa của người công bố.
export async function publishExamSessions(input: ExamPublishInput): Promise<ActionResult<{ ids: string[] }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_PUBLISH_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { termId, kind } = parsed.data;
  let ids: string[];
  try {
    const drafts = await db
      .select({ id: examSessions.id, faculty: faculties.name })
      .from(examSessions)
      .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .innerJoin(faculties, eq(faculties.id, courses.facultyId))
      .where(and(eq(examSessions.termId, termId), eq(examSessions.kind, kind), eq(examSessions.status, "draft")));
    const target = drafts.filter((draft) => inScope(viewer, draft.faculty)).map((draft) => draft.id);
    if (target.length === 0) return actionError("Không còn ca thi dự kiến nào để công bố.");
    const rows = await db
      .update(examSessions)
      .set({ status: "published" })
      .where(and(inArray(examSessions.id, target), eq(examSessions.status, "draft")))
      .returning({ id: examSessions.id });
    ids = rows.map((row) => row.id);
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  return actionOk({ ids });
}

// Cho sinh viên vắng quá ngưỡng được dự thi khi có minh chứng; lý do lưu cùng người quyết định.
export async function allowExamDespiteAbsence(input: EligibilityOverrideInput): Promise<ActionResult<{ enrollmentId: string; reason: string }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(ELIGIBILITY_OVERRIDE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { enrollmentId, reason } = parsed.data;
  try {
    const [enrollment] = await db
      .select({ status: enrollments.status, faculty: faculties.name })
      .from(enrollments)
      .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .innerJoin(faculties, eq(faculties.id, courses.facultyId))
      .where(eq(enrollments.id, enrollmentId));
    if (!enrollment || enrollment.status !== "enrolled" || !inScope(viewer, enrollment.faculty)) {
      return actionError("Sinh viên không còn học lớp này hoặc lớp ngoài phạm vi khoa của bạn, tải lại trang.");
    }
    await db.insert(examEligibilityOverrides).values({ enrollmentId, reason, decidedByUserId: viewer.id });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/exams/eligibility");
  revalidatePath("/application/exams");
  return actionOk({ enrollmentId, reason });
}

// Giảng viên nộp đề cho ca thi của lớp mình dạy. Đề đã duyệt hoặc ca đã thi thì không nộp lại được.
// Chưa có dịch vụ lưu tệp: mới ghi khóa lưu trữ và thời điểm nộp, nội dung tệp chưa được tải lên.
export async function submitExamPaper(input: ExamPaperSubmitInput): Promise<ActionResult<{ id: string; paperStatus: ExamPaperStatus }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(EXAM_PAPER_SUBMIT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { examSessionId } = parsed.data;
  let row: { id: string; paperStatus: ExamPaperStatus } | undefined;
  try {
    [row] = await db
      .update(examSessions)
      .set({ paperStatus: "submitted", paperStorageKey: examPaperStorageKey(examSessionId, newId()), paperSubmittedAt: sql`now()` })
      .where(
        and(
          eq(examSessions.id, examSessionId),
          inArray(examSessions.status, ["draft", "published"]),
          inArray(examSessions.paperStatus, ["not-submitted", "submitted"]),
          inArray(
            examSessions.classSectionId,
            db.select({ id: classSections.id }).from(classSections).where(eq(classSections.lecturerId, lecturer.id)),
          ),
        ),
      )
      .returning({ id: examSessions.id, paperStatus: examSessions.paperStatus });
  } catch (error) {
    return failure(error);
  }
  if (!row) return actionError("Không nộp được: ca thi không thuộc lớp bạn dạy, đã thi hoặc đề đã được duyệt. Tải lại trang để xem trạng thái mới.");
  revalidatePath("/lecturer/exams");
  revalidatePath("/administrator/exams");
  return actionOk(row);
}

// Giảng viên đang được phân công coi một ca chưa thi đề nghị đổi cho đồng nghiệp; Phòng Khảo thí xử lý bằng cách đổi phân công.
export async function requestProctorSwap(input: ProctorSwapInput): Promise<ActionResult<{ examSessionId: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(PROCTOR_SWAP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { examSessionId, colleagueId, reason } = parsed.data;
  try {
    const [exam] = await db.select({ status: examSessions.status }).from(examSessions).where(eq(examSessions.id, examSessionId));
    if (!exam) return actionError("Ca thi không còn trong lịch, tải lại trang.");
    if (exam.status === "done") return actionError("Ca thi đã diễn ra, không đổi ca được.");
    const [colleague] = await db.select({ status: lecturers.status }).from(lecturers).where(eq(lecturers.id, colleagueId));
    if (!colleague || colleague.status !== "active") return actionError("Người coi thay không còn công tác", { colleagueId: "Chọn người khác" });
    const [already] = await db
      .select({ id: examProctors.lecturerId })
      .from(examProctors)
      .where(and(eq(examProctors.examSessionId, examSessionId), eq(examProctors.lecturerId, colleagueId)));
    if (already) return actionError("Người này đã coi cùng ca thi", { colleagueId: "Người này đã coi cùng ca thi" });
    await db.insert(examProctorSwapRequests).values({ examSessionId, requesterId: lecturer.id, substituteId: colleagueId, reason });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lecturer/exams");
  revalidatePath("/administrator/exams");
  return actionOk({ examSessionId });
}
