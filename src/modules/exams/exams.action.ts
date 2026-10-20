"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { deleteFiles, newStorageKey, withStoredFiles } from "@/shared/libs/storage.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { EXAMS_CONSTRAINT_MESSAGE } from "@/modules/exams/exams.constant";
import { decidePaperReview, ExamInputError, recordPaperSubmission, type PaperDecision } from "@/modules/exams/exams.lib";
import { getExamSession } from "@/modules/exams/exams.query";
import {
  ELIGIBILITY_OVERRIDE_SCHEMA,
  EXAM_PAPER_APPROVE_SCHEMA,
  EXAM_PAPER_RETURN_SCHEMA,
  EXAM_PAPER_SUBMIT_SCHEMA,
  EXAM_PUBLISH_SCHEMA,
  checkExamPaperFiles,
  EXAM_SESSION_UPDATE_SCHEMA,
  PROCTOR_SWAP_SCHEMA,
  readExamPaperForm,
  type EligibilityOverrideInput,
  type ExamPaperApproveInput,
  type ExamPaperReturnInput,
  type ExamPublishInput,
  type ExamSessionUpdateInput,
  type ProctorSwapInput,
} from "@/modules/exams/exams.rule";
import { examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import type { ExamPaperFile, ExamPaperFileKind, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { rooms } from "@/modules/facilities/facilities.schema";
import { lecturers } from "@/modules/users/users.schema";
import { getCurrentLecturer } from "@/modules/users/users.query";

function failure(error: unknown) {
  if (error instanceof ExamInputError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
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
      if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
      if (exam.status === "done") throw new ExamInputError("Ca thi đã diễn ra, không sửa được nữa.");
      if (values.date < exam.termStart || values.date > exam.termEnd) throw new ExamInputError("Ngày thi phải nằm trong học kỳ", "date");
      const [room] = await tx.select({ status: rooms.status }).from(rooms).where(eq(rooms.id, roomId));
      if (!room) throw new ExamInputError("Phòng không còn trong danh mục", "roomId");
      if (room.status !== "active") throw new ExamInputError("Phòng đang bảo trì, chọn phòng khác", "roomId");
      const people = await tx.select({ id: lecturers.id }).from(lecturers).where(and(inArray(lecturers.id, proctorIds), eq(lecturers.status, "active")));
      if (people.length !== proctorIds.length) throw new ExamInputError("Có cán bộ coi thi không còn công tác", "proctorIds");

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

// Giảng viên nộp đề và đáp án (FormData, xem readExamPaperForm) cho ca thi của lớp mình dạy. Đề đã duyệt hoặc ca đã thi thì không
// nộp lại được (DB cũng chặn bằng trigger exam_sessions_paper_locked); đề bị trả lại thì nộp lại được và chờ duyệt lại. Nộp lại
// thì tệp cũ bị xóa sau khi giao dịch ghi tệp mới thành công.
export async function submitExamPaper(formData: FormData): Promise<ActionResult<{ id: string; paperStatus: ExamPaperStatus; paperSubmittedAt: string; papers: ExamPaperFile[] }>> {
  const lecturer = await getCurrentLecturer();
  const form = readExamPaperForm(formData);
  const parsed = parseInput(EXAM_PAPER_SUBMIT_SCHEMA, form.input);
  if (!parsed.ok) return parsed;
  const { examSessionId } = parsed.data;
  const uploads = await Promise.all(
    (["paper", "answer-key"] as const).map(async (kind) => {
      const file = form.files[kind];
      return [kind, file ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null] as const;
    }),
  );
  const data = Object.fromEntries(uploads) as Record<ExamPaperFileKind, { name: string; data: Uint8Array } | null>;
  const toCheck = (kind: ExamPaperFileKind) => {
    const file = data[kind];
    return file ? { name: file.name, size: file.data.byteLength, head: file.data.subarray(0, 16) } : null;
  };
  const checked = checkExamPaperFiles({ paper: toCheck("paper"), "answer-key": toCheck("answer-key") });
  if (!checked.ok) return actionError(Object.values(checked.fieldErrors)[0] ?? "Tệp không hợp lệ", checked.fieldErrors);
  const paper = { ...checked.files.paper, data: data.paper!.data, key: newStorageKey("exams") };
  const answerKey = { ...checked.files["answer-key"], data: data["answer-key"]!.data, key: newStorageKey("exams") };
  let result: { row: { id: string; paperStatus: ExamPaperStatus; paperSubmittedAt: Date | null }; replaced: string[] };
  try {
    result = await withStoredFiles([paper, answerKey], () =>
      db.transaction((tx) => recordPaperSubmission(tx, lecturer.id, examSessionId, { paper, answerKey })),
    );
  } catch (error) {
    return failure(error);
  }
  // Tệp của lần nộp trước: xóa sau khi commit; xóa không được thì tác vụ dọn tệp mồ côi xóa sau.
  await deleteFiles(result.replaced);
  revalidatePath("/lecturer/exams");
  revalidatePath("/administrator/exams");
  return actionOk({
    id: result.row.id,
    paperStatus: result.row.paperStatus,
    paperSubmittedAt: (result.row.paperSubmittedAt ?? new Date()).toISOString(),
    papers: [
      { kind: "paper", fileName: paper.name, sizeBytes: paper.data.byteLength },
      { kind: "answer-key", fileName: answerKey.name, sizeBytes: answerKey.data.byteLength },
    ],
  });
}

async function reviewExamPaper(viewer: Viewer, examSessionId: string, decision: PaperDecision): Promise<ActionResult<ExamSession>> {
  try {
    await db.transaction((tx) => decidePaperReview(tx, viewer, examSessionId, decision));
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  const exam = await getExamSession(examSessionId);
  if (!exam) return actionError("Ca thi không còn trong lịch, tải lại trang.");
  return actionOk(exam);
}

// Phòng Khảo thí duyệt đề đang chờ duyệt: đề bị khóa, giảng viên không nộp lại được.
export async function approveExamPaper(input: ExamPaperApproveInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_PAPER_APPROVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  return reviewExamPaper(viewer, parsed.data.examSessionId, { decision: "approve" });
}

// Phòng Khảo thí trả lại đề kèm lý do: giảng viên thấy lý do và nộp lại.
export async function returnExamPaper(input: ExamPaperReturnInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_PAPER_RETURN_SCHEMA, input);
  if (!parsed.ok) return parsed;
  return reviewExamPaper(viewer, parsed.data.examSessionId, { decision: "return", reason: parsed.data.reason });
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
