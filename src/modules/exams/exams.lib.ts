import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { sweepOrphanFiles } from "@/shared/libs/storage.lib";
import { can, inScope } from "@/modules/access/access.constant";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { EXAM_KIND_LABEL, EXAM_PAPER_STATUS, LECTURER_EXAMS_HREF } from "@/modules/exams/exams.constant";
import { PAPER_SUBMITTABLE_STATUSES, paperReviewBlockedReason } from "@/modules/exams/exams.rule";
import { examSessions } from "@/modules/exams/exams.schema";
import { notifyLecturers } from "@/modules/notifications/notifications.lib";

// Lỗi nghiệp vụ của lịch thi: action đổi thành câu báo, field có thì gắn vào ô của form.
export class ExamInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

// Tác vụ định kỳ: xóa tệp đề thi, đáp án không còn ca thi nào trỏ tới (bản cũ của lần nộp lại chưa xóa được, tiến trình chết
// giữa lúc ghi tệp và commit).
export async function sweepOrphanExamFiles() {
  const removed = await sweepOrphanFiles("exams", async (keys) => {
    const rows = await db
      .select({ paper: examSessions.paperStorageKey, answerKey: examSessions.answerKeyStorageKey })
      .from(examSessions)
      .where(or(inArray(examSessions.paperStorageKey, keys), inArray(examSessions.answerKeyStorageKey, keys)));
    return new Set(rows.flatMap((row) => [row.paper, row.answerKey]).filter((key) => key !== null));
  });
  return { examFilesRemoved: removed };
}

export type PaperUpload = { key: string; name: string; contentType: string; data: Uint8Array };

// Ghi lần nộp đề (tệp đã nằm trong kho) cho ca thi của lớp giảng viên dạy, chưa thi, đề chưa duyệt. Nộp lại thì xóa kết quả
// xét lần trước (đề bị trả lại quay về chờ duyệt). Trả khóa tệp cũ để xóa sau khi commit.
export async function recordPaperSubmission(tx: Transaction, lecturerId: string, examSessionId: string, files: { paper: PaperUpload; answerKey: PaperUpload }) {
  const { paper, answerKey } = files;
  const [current] = await tx
    .select({ paperStorageKey: examSessions.paperStorageKey, answerKeyStorageKey: examSessions.answerKeyStorageKey })
    .from(examSessions)
    .where(
      and(
        eq(examSessions.id, examSessionId),
        inArray(examSessions.status, ["draft", "published"]),
        inArray(examSessions.paperStatus, [...PAPER_SUBMITTABLE_STATUSES]),
        inArray(examSessions.classSectionId, tx.select({ id: classSections.id }).from(classSections).where(eq(classSections.lecturerId, lecturerId))),
      ),
    )
    .for("update");
  if (!current) throw new ExamInputError("Không nộp được: ca thi không thuộc lớp bạn dạy, đã thi hoặc đề đã được duyệt. Tải lại trang để xem trạng thái mới.");
  const [row] = await tx
    .update(examSessions)
    .set({
      paperStatus: "submitted",
      paperStorageKey: paper.key,
      paperFileName: paper.name,
      paperContentType: paper.contentType,
      paperSizeBytes: paper.data.byteLength,
      answerKeyStorageKey: answerKey.key,
      answerKeyFileName: answerKey.name,
      answerKeyContentType: answerKey.contentType,
      answerKeySizeBytes: answerKey.data.byteLength,
      paperSubmittedAt: sql`now()`,
      paperReviewedByUserId: null,
      paperReviewedAt: null,
      paperReturnReason: null,
    })
    .where(eq(examSessions.id, examSessionId))
    .returning({ id: examSessions.id, paperStatus: examSessions.paperStatus, paperSubmittedAt: examSessions.paperSubmittedAt });
  return { row, replaced: [current.paperStorageKey, current.answerKeyStorageKey].filter((key) => key !== null) };
}

export type PaperDecision = { decision: "approve" } | { decision: "return"; reason: string };

// Phòng Khảo thí (quyền exams.manage, đúng phạm vi khoa) xét đề đang chờ duyệt: duyệt thì khóa đề, trả lại thì giảng viên thấy
// lý do và nộp lại. Ghi người xét, thời điểm, nhật ký thao tác và báo giảng viên dạy lớp trong cùng giao dịch.
export async function decidePaperReview(tx: Transaction, viewer: Viewer, examSessionId: string, decision: PaperDecision) {
  if (!can(viewer, "exams.manage")) throw new ExamInputError("Vai trò hiện tại không có quyền duyệt đề thi.");
  const [exam] = await tx
    .select({
      status: examSessions.status,
      paperStatus: examSessions.paperStatus,
      kind: examSessions.kind,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerId: classSections.lecturerId,
      faculty: faculties.name,
    })
    .from(examSessions)
    .innerJoin(classSections, eq(classSections.id, examSessions.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(examSessions.id, examSessionId))
    .for("update", { of: examSessions });
  if (!exam || !inScope(viewer, exam.faculty)) throw new ExamInputError("Ca thi không còn trong lịch hoặc ngoài phạm vi khoa của bạn, tải lại trang.");
  const blocked = paperReviewBlockedReason(exam);
  if (blocked) throw new ExamInputError(`${blocked} Tải lại trang để xem trạng thái mới.`);
  const next = decision.decision === "approve" ? "approved" : "returned";
  await tx
    .update(examSessions)
    .set({
      paperStatus: next,
      paperReviewedByUserId: viewer.id,
      paperReviewedAt: sql`now()`,
      paperReturnReason: decision.decision === "return" ? decision.reason : null,
    })
    .where(eq(examSessions.id, examSessionId));
  const kind = EXAM_KIND_LABEL[exam.kind].toLowerCase();
  const label = `${kind} lớp ${exam.classCode}`;
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: decision.decision === "approve" ? "approve" : "reject",
    entityType: "exam",
    entityId: examSessionId,
    entityLabel: `${exam.classCode} ${exam.courseName} (${kind})`,
    summary: decision.decision === "approve" ? `Duyệt đề thi ${label}` : `Trả lại đề thi ${label}: ${decision.reason}`,
    changes: [{ field: "Trạng thái đề", before: EXAM_PAPER_STATUS[exam.paperStatus].label, after: EXAM_PAPER_STATUS[next].label }],
  });
  if (exam.lecturerId) {
    await notifyLecturers(
      tx,
      [exam.lecturerId],
      decision.decision === "approve"
        ? { kind: "exam", title: `Đề thi ${label} đã được duyệt`, body: `Phòng Khảo thí đã duyệt đề ${exam.courseName}. Đề đã khóa, không nộp lại được.`, href: LECTURER_EXAMS_HREF }
        : { kind: "exam", title: `Đề thi ${label} bị trả lại`, body: `Lý do: ${decision.reason.replace(/[.\s]+$/, "")}. Sửa đề và nộp lại trước hạn.`, href: LECTURER_EXAMS_HREF },
    );
  }
  return next;
}
