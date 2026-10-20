"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { buildTablePdf, PDF_MIME } from "@/shared/libs/pdf.lib";
import { bytesToBase64 } from "@/shared/libs/spreadsheet.lib";
import { deleteFiles, newStorageKey, withStoredFiles } from "@/shared/libs/storage.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { ADMIN_EXAMS_HREF, EXAM_FORMAT_LABEL, EXAM_KIND_LABEL, EXAMS_CONSTRAINT_MESSAGE, STUDENT_EXAMS_HREF } from "@/modules/exams/exams.constant";
import {
  createSession,
  decidePaperReview,
  decideProctorSwap,
  describeSlot,
  entityLabel,
  examOfficeUserIds,
  ExamInputError,
  generateFinals,
  notifyExamPeople,
  publishDrafts,
  recordPaperSubmission,
  sessionForWrite,
  sessionLabel,
  termSchedule,
  unlockApprovedPaper,
  updateSession,
  type PaperDecision,
} from "@/modules/exams/exams.lib";
import { getExamRoster, getExamSession, getSectionStudents } from "@/modules/exams/exams.query";
import {
  ELIGIBILITY_OVERRIDE_SCHEMA,
  ELIGIBILITY_REVOKE_SCHEMA,
  EXAM_DEFERRAL_SCHEMA,
  EXAM_GENERATE_SCHEMA,
  EXAM_PAPER_APPROVE_SCHEMA,
  EXAM_PAPER_RETURN_SCHEMA,
  EXAM_PAPER_SUBMIT_SCHEMA,
  EXAM_PAPER_UNLOCK_SCHEMA,
  EXAM_PUBLISH_SCHEMA,
  EXAM_SESSION_CREATE_SCHEMA,
  EXAM_SESSION_DELETE_SCHEMA,
  EXAM_SESSION_UPDATE_SCHEMA,
  checkExamPaperFiles,
  PROCTOR_SWAP_DECIDE_SCHEMA,
  PROCTOR_SWAP_SCHEMA,
  readExamPaperForm,
  slotsOverlap,
  type EligibilityOverrideInput,
  type EligibilityRevokeInput,
  type ExamDeferralInput,
  type ExamGenerateInput,
  type ExamPaperApproveInput,
  type ExamPaperReturnInput,
  type ExamPaperUnlockInput,
  type ExamPublishInput,
  type ExamSessionCreateInput,
  type ExamSessionUpdateInput,
  type ProctorSwapDecideInput,
  type ProctorSwapInput,
} from "@/modules/exams/exams.rule";
import { examCandidates, examDeferrals, examEligibilityOverrides, examProctors, examProctorSwapRequests, examSessions } from "@/modules/exams/exams.schema";
import type { ExamPaperFile, ExamPaperFileKind, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";
import { notifyStudents, notifyUsers } from "@/modules/notifications/notifications.lib";
import { lecturers, students } from "@/modules/users/users.schema";
import { getCurrentLecturer } from "@/modules/users/users.query";

function failure(error: unknown) {
  if (error instanceof ExamInputError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, EXAMS_CONSTRAINT_MESSAGE);
}

function revalidateExams() {
  revalidatePath("/administrator/exams", "layout");
  revalidatePath("/lecturer/exams");
  revalidatePath("/lecturer", "layout");
  revalidatePath(STUDENT_EXAMS_HREF);
  revalidatePath("/application/dashboard");
}

async function readBack(id: string): Promise<ActionResult<ExamSession>> {
  revalidateExams();
  const exam = await getExamSession(id);
  return exam ? actionOk(exam) : actionError("Ca thi không còn trong lịch, tải lại trang.");
}

// Phòng Khảo thí tạo một ca thi: giữa kỳ, cuối kỳ cho cả lớp, hoặc ca thi bù cho danh sách sinh viên của một ca gốc.
export async function createExamSession(input: ExamSessionCreateInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_SESSION_CREATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let id: string;
  try {
    id = await db.transaction((tx) => createSession(tx, viewer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  return readBack(id);
}

// Phòng Khảo thí sửa ngày giờ, thời lượng, hạn nộp đề, phòng, hình thức, cán bộ coi thi của ca chưa thi. Ca đã công bố thì báo
// sinh viên, giảng viên và cán bộ coi thi (cả người bị gỡ) về thay đổi.
export async function updateExamSession(input: ExamSessionUpdateInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_SESSION_UPDATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id } = parsed.data;
  try {
    await db.transaction((tx) => updateSession(tx, viewer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  return readBack(id);
}

// Xóa ca thi chưa diễn ra. Ca đã công bố thì phải có lý do và báo mọi người liên quan.
export async function deleteExamSession(input: { id: string; reason?: string | null }): Promise<ActionResult<{ id: string }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_SESSION_DELETE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { id, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const exam = await sessionForWrite(tx, id);
      if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
      if (exam.status === "done" || exam.hasStarted) throw new ExamInputError("Ca thi đã diễn ra, không xóa được.");
      if (exam.paperStatus !== "not-submitted") throw new ExamInputError("Giảng viên đã nộp đề cho ca này. Đổi lịch thay vì xóa ca.");
      if (exam.status === "published" && !reason) throw new ExamInputError("Ca đã công bố: ghi lý do xóa để báo sinh viên.", "reason");
      if (exam.status === "published") {
        await notifyExamPeople(tx, exam, {
          title: `Hủy ca thi ${sessionLabel(exam)}`,
          studentBody: `Ca thi ${exam.courseName} lúc ${describeSlot(exam, [])} bị hủy: ${reason}. Phòng Khảo thí sẽ công bố lịch mới.`,
          staffBody: `Ca thi ${exam.courseName} lúc ${describeSlot(exam, [])} bị hủy: ${reason}.`,
        });
      }
      await tx.delete(examSessions).where(eq(examSessions.id, id));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "delete",
        entityType: "exam",
        entityId: id,
        entityLabel: entityLabel(exam),
        summary: `Xóa ca thi ${sessionLabel(exam)} (${describeSlot(exam, [])})${reason ? `: ${reason}` : ""}`,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  return actionOk({ id });
}

// Sinh hàng loạt ca cuối kỳ (dự kiến) cho các lớp mở chưa có ca: xếp lớp đông trước vào ngày, giờ thi sớm nhất còn đủ phòng,
// đủ 2 cán bộ coi thi mỗi phòng (cùng khoa, không dạy lớp đó, không trùng ca hay giờ dạy) và không trùng lịch thi của sinh viên.
// Lớp không xếp được thì báo lại để xếp tay.
export async function generateFinalExams(input: ExamGenerateInput): Promise<ActionResult<{ created: number; skipped: string[]; fromSyllabus: number }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_GENERATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let result: { created: number; skipped: string[]; fromSyllabus: number };
  try {
    result = await db.transaction((tx) => generateFinals(tx, viewer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  return actionOk(result);
}

// Công bố mọi ca dự kiến cùng loại của học kỳ trong phạm vi khoa: ca phải đủ phòng cho thí sinh và đủ 2 cán bộ coi thi mỗi
// phòng, không trùng phòng hay cán bộ. Xếp lại số báo danh theo danh sách lớp mới nhất, báo sinh viên, giảng viên, cán bộ coi thi.
export async function publishExamSessions(input: ExamPublishInput): Promise<ActionResult<{ ids: string[]; notifiedStudents: number }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_PUBLISH_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let result: { ids: string[]; notifiedStudents: number };
  try {
    result = await db.transaction((tx) => publishDrafts(tx, viewer, parsed.data.termId, parsed.data.kind));
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  return actionOk(result);
}

// Cho sinh viên vắng quá ngưỡng được dự thi khi có minh chứng: lưu lý do cùng người quyết định, ghi nhật ký, báo sinh viên.
export async function allowExamDespiteAbsence(input: EligibilityOverrideInput): Promise<ActionResult<{ enrollmentId: string; reason: string }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(ELIGIBILITY_OVERRIDE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { enrollmentId, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const enrollment = await enrollmentInScope(tx, viewer, enrollmentId);
      await tx.insert(examEligibilityOverrides).values({ enrollmentId, reason, decidedByUserId: viewer.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "approve",
        entityType: "exam",
        entityId: enrollmentId,
        entityLabel: `${enrollment.fullName} - ${enrollment.sectionCode}`,
        summary: `Cho dự thi dù vắng quá ngưỡng: ${enrollment.fullName} (${enrollment.sectionCode}). Lý do: ${reason}`,
      });
      await notifyStudents(tx, [enrollment.studentId], {
        kind: "exam",
        title: `Được dự thi ${enrollment.sectionCode}`,
        body: `Phòng Khảo thí cho bạn dự thi ${enrollment.courseName} dù số tiết vắng vượt ngưỡng. Lý do: ${reason}`,
        href: STUDENT_EXAMS_HREF,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/exams/eligibility");
  revalidatePath(STUDENT_EXAMS_HREF);
  return actionOk({ enrollmentId, reason });
}

// Thu hồi quyết định cho dự thi (minh chứng không hợp lệ): giữ lịch sử, ghi nhật ký, báo sinh viên.
export async function revokeExamOverride(input: EligibilityRevokeInput): Promise<ActionResult<{ enrollmentId: string }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(ELIGIBILITY_REVOKE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { enrollmentId, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const enrollment = await enrollmentInScope(tx, viewer, enrollmentId);
      const rows = await tx
        .update(examEligibilityOverrides)
        .set({ revokedAt: sql`now()`, revokedByUserId: viewer.id, revokeReason: reason })
        .where(and(eq(examEligibilityOverrides.enrollmentId, enrollmentId), isNull(examEligibilityOverrides.revokedAt)))
        .returning({ id: examEligibilityOverrides.id, reason: examEligibilityOverrides.reason });
      if (rows.length === 0) throw new ExamInputError("Sinh viên không còn quyết định cho dự thi nào, tải lại trang.");
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "reject",
        entityType: "exam",
        entityId: enrollmentId,
        entityLabel: `${enrollment.fullName} - ${enrollment.sectionCode}`,
        summary: `Thu hồi cho dự thi: ${enrollment.fullName} (${enrollment.sectionCode}). Lý do: ${reason}`,
        changes: [{ field: "Cho dự thi", before: rows[0].reason, after: "Đã thu hồi" }],
      });
      await notifyStudents(tx, [enrollment.studentId], {
        kind: "exam",
        title: `Thu hồi quyết định cho dự thi ${enrollment.sectionCode}`,
        body: `Bạn thuộc diện cấm thi ${enrollment.courseName} do vắng quá ngưỡng. Lý do thu hồi: ${reason}`,
        href: STUDENT_EXAMS_HREF,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/exams/eligibility");
  revalidatePath(STUDENT_EXAMS_HREF);
  return actionOk({ enrollmentId });
}

async function enrollmentInScope(tx: Transaction, viewer: Viewer, enrollmentId: string) {
  const [enrollment] = await tx
    .select({
      status: enrollments.status,
      studentId: enrollments.studentId,
      classSectionId: enrollments.classSectionId,
      faculty: faculties.name,
      fullName: students.fullName,
      sectionCode: classSections.code,
      courseName: courses.name,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(enrollments.id, enrollmentId));
  if (!enrollment || enrollment.status !== "enrolled" || !inScope(viewer, enrollment.faculty)) {
    throw new ExamInputError("Sinh viên không còn học lớp này hoặc lớp ngoài phạm vi khoa của bạn, tải lại trang.");
  }
  return enrollment;
}

// Ghi nhận sinh viên được hoãn một kỳ thi: rời danh sách thi (và phòng) của ca đó, chờ thi bù. Ca đã diễn ra thì vẫn ghi (vắng
// thi có lý do được thi bù).
export async function deferExam(input: ExamDeferralInput): Promise<ActionResult<{ id: string }>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(EXAM_DEFERRAL_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { enrollmentId, kind, reason } = parsed.data;
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const enrollment = await enrollmentInScope(tx, viewer, enrollmentId);
      const [row] = await tx.insert(examDeferrals).values({ enrollmentId, kind, reason, decidedByUserId: viewer.id }).returning({ id: examDeferrals.id });
      const [session] = await tx
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(and(eq(examSessions.classSectionId, enrollment.classSectionId), eq(examSessions.kind, kind)));
      if (session) {
        const exam = await sessionForWrite(tx, session.id);
        if (exam && !exam.hasStarted) await tx.delete(examCandidates).where(and(eq(examCandidates.examSessionId, session.id), eq(examCandidates.enrollmentId, enrollmentId)));
      }
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "approve",
        entityType: "exam",
        entityId: enrollmentId,
        entityLabel: `${enrollment.fullName} - ${enrollment.sectionCode}`,
        summary: `Cho hoãn thi ${EXAM_KIND_LABEL[kind].toLowerCase()}: ${enrollment.fullName} (${enrollment.sectionCode}). Lý do: ${reason}`,
      });
      await notifyStudents(tx, [enrollment.studentId], {
        kind: "exam",
        title: `Được hoãn thi ${EXAM_KIND_LABEL[kind].toLowerCase()} ${enrollment.sectionCode}`,
        body: `Bạn không thi ca ${EXAM_KIND_LABEL[kind].toLowerCase()} ${enrollment.courseName}; Phòng Khảo thí sẽ báo lịch thi bù.`,
        href: STUDENT_EXAMS_HREF,
      });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateExams();
  return actionOk({ id });
}

// Giảng viên nộp đề và đáp án (FormData, xem readExamPaperForm) cho ca thi của lớp mình dạy, trước hạn và trước giờ thi. Nộp lại
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
    result = await withStoredFiles([paper, answerKey], () => db.transaction((tx) => recordPaperSubmission(tx, lecturer.id, examSessionId, { paper, answerKey })));
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
  return readBack(examSessionId);
}

// Phòng Khảo thí duyệt đúng bản đề đã xem (thời điểm nộp): đề bị khóa, giảng viên không nộp lại được.
export async function approveExamPaper(input: ExamPaperApproveInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.review");
  const parsed = parseInput(EXAM_PAPER_APPROVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  return reviewExamPaper(viewer, parsed.data.examSessionId, { decision: "approve", paperSubmittedAt: parsed.data.paperSubmittedAt });
}

// Phòng Khảo thí trả lại đề kèm lý do: giảng viên thấy lý do và nộp lại.
export async function returnExamPaper(input: ExamPaperReturnInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.review");
  const parsed = parseInput(EXAM_PAPER_RETURN_SCHEMA, input);
  if (!parsed.ok) return parsed;
  return reviewExamPaper(viewer, parsed.data.examSessionId, { decision: "return", reason: parsed.data.reason, paperSubmittedAt: parsed.data.paperSubmittedAt });
}

// Mở khóa đề đã duyệt khi phát hiện lỗi: đề chuyển "bị trả lại", giảng viên nộp lại.
export async function unlockExamPaper(input: ExamPaperUnlockInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.review");
  const parsed = parseInput(EXAM_PAPER_UNLOCK_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => unlockApprovedPaper(tx, viewer, parsed.data.examSessionId, parsed.data.reason));
  } catch (error) {
    return failure(error);
  }
  return readBack(parsed.data.examSessionId);
}

// Giảng viên đang coi một ca chưa thi đề nghị đổi cho đồng nghiệp cùng khoa; Phòng Khảo thí nhận thông báo và chấp nhận hay từ chối.
export async function requestProctorSwap(input: ProctorSwapInput): Promise<ActionResult<{ examSessionId: string }>> {
  const lecturer = await getCurrentLecturer();
  const parsed = parseInput(PROCTOR_SWAP_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { examSessionId, colleagueId, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const exam = await sessionForWrite(tx, examSessionId);
      if (!exam) throw new ExamInputError("Ca thi không còn trong lịch, tải lại trang.");
      if (exam.status === "done" || exam.hasStarted) throw new ExamInputError("Ca thi đã diễn ra, không đổi ca được.");
      const people = await tx.select({ id: lecturers.id, facultyId: lecturers.facultyId, status: lecturers.status }).from(lecturers).where(inArray(lecturers.id, [lecturer.id, colleagueId]));
      const me = people.find((person) => person.id === lecturer.id);
      const colleague = people.find((person) => person.id === colleagueId);
      if (!colleague || colleague.status !== "active") throw new ExamInputError("Người coi thay không còn công tác", "colleagueId");
      if (colleague.facultyId !== me?.facultyId) throw new ExamInputError("Chỉ đổi ca với đồng nghiệp cùng khoa", "colleagueId");
      const [already] = await tx
        .select({ id: examProctors.lecturerId })
        .from(examProctors)
        .where(and(eq(examProctors.examSessionId, examSessionId), eq(examProctors.lecturerId, colleagueId)));
      if (already) throw new ExamInputError("Người này đã coi cùng ca thi", "colleagueId");
      const busy = (await termSchedule(tx, exam.termId)).find((session) => session.id !== exam.id && slotsOverlap(session, exam) && session.proctors.some((proctor) => proctor.id === colleagueId));
      if (busy) throw new ExamInputError(`Người này đã coi ca ${busy.classCode} trùng giờ`, "colleagueId");
      await tx.insert(examProctorSwapRequests).values({ examSessionId, requesterId: lecturer.id, substituteId: colleagueId, reason });
      await notifyUsers(tx, await examOfficeUserIds(tx), "administrator", {
        kind: "exam",
        title: `Đề nghị đổi ca coi thi ${sessionLabel(exam)}`,
        body: `${lecturer.displayName} đề nghị đổi ca lúc ${describeSlot(exam, [])}: ${reason}`,
        href: ADMIN_EXAMS_HREF,
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/lecturer/exams");
  revalidatePath("/administrator/exams");
  return actionOk({ examSessionId });
}

// Phòng Khảo thí chấp nhận hoặc từ chối đề nghị đổi ca coi thi.
export async function decideProctorSwapRequest(input: ProctorSwapDecideInput): Promise<ActionResult<ExamSession>> {
  const viewer = await requirePermission("exams.manage");
  const parsed = parseInput(PROCTOR_SWAP_DECIDE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let examSessionId: string;
  try {
    examSessionId = await db.transaction(async (tx) => {
      const [swap] = await tx.select({ examSessionId: examProctorSwapRequests.examSessionId }).from(examProctorSwapRequests).where(eq(examProctorSwapRequests.id, parsed.data.id));
      if (!swap) throw new ExamInputError("Đề nghị không còn, tải lại trang.");
      await decideProctorSwap(tx, viewer, parsed.data.id, parsed.data.decision, parsed.data.note);
      return swap.examSessionId;
    });
  } catch (error) {
    return failure(error);
  }
  return readBack(examSessionId);
}

// Danh sách phòng thi (thí sinh theo phòng, số báo danh) bản PDF để in: Phòng Khảo thí, giảng viên dạy lớp, cán bộ coi thi.
export async function exportExamRosterPdf(examSessionId: string): Promise<ActionResult<{ fileName: string; base64: string; mimeType: string }>> {
  if (!isUuid(examSessionId)) return actionError("Ca thi không hợp lệ.");
  const roster = await getExamRoster(examSessionId);
  if (!roster) return actionError("Ca thi không còn hoặc bạn không có quyền xem danh sách thi.");
  const { exam, rows } = roster;
  if (rows.length === 0) return actionError("Ca thi chưa xếp thí sinh vào phòng.");
  const bytes = await buildTablePdf({
    title: `Danh sách phòng thi ${EXAM_KIND_LABEL[exam.kind].toLowerCase()} ${exam.classCode}`,
    subtitle: `${exam.courseName}. ${formatDate(exam.date)}, ${exam.startTime}, ${exam.durationMinutes} phút, ${EXAM_FORMAT_LABEL[exam.format].toLowerCase()}. Cán bộ coi thi: ${exam.rooms
      .map((room) => `${room.code}: ${room.proctors.map((proctor) => proctor.name).join(", ") || "chưa phân công"}`)
      .join("; ")}`,
    unit: "Phòng Khảo thí",
    header: ["SBD", "Phòng", "MSSV", "Họ và tên", "Lớp", "Ký tên"],
    rows: rows.map((row) => [row.candidateNumber, row.room, row.studentCode, row.fullName, row.className, ""]),
  });
  return actionOk({ fileName: `danh-sach-thi-${exam.classCode}-${exam.kind}.pdf`, base64: bytesToBase64(bytes), mimeType: PDF_MIME });
}

// Danh sách thí sinh để xem trên trang (cùng quyền với bản PDF).
export async function loadExamRoster(examSessionId: string) {
  if (!isUuid(examSessionId)) return actionError("Ca thi không hợp lệ.");
  const roster = await getExamRoster(examSessionId);
  return roster ? actionOk(roster.rows) : actionError("Ca thi không còn hoặc bạn không có quyền xem danh sách thi.");
}

// Sinh viên đang học lớp (chọn người thi bù, hoãn thi).
export async function listSectionStudents(classSectionId: string) {
  if (!isUuid(classSectionId)) return actionError("Lớp học phần không hợp lệ.");
  return actionOk(await getSectionStudents(classSectionId));
}
