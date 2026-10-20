import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { mockId } from "@/shared/libs/mock.lib";
import { deleteFiles, listFiles, newStorageKey, putFile } from "@/shared/libs/storage.lib";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import { examProctors, examSessions } from "@/modules/exams/exams.schema";
import type { ExamPaperFileKind, ExamSession } from "@/modules/exams/exams.type";
import type { SeedContext } from "./context";
import { samplePdf } from "./sample-file";

// Tệp đề, đáp án mẫu: PDF nhỏ "Tệp mẫu", khóa tất định theo id ca thi để seed lại thì ghi đè đúng tệp.
function samplePaper(exam: ExamSession, kind: ExamPaperFileKind) {
  const meta = exam.papers.find((paper) => paper.kind === kind);
  if (!meta) return null;
  return { fileName: meta.fileName, data: samplePdf(meta.fileName), key: newStorageKey("exams", mockId(`exam-paper:${exam.id}:${kind}`)) };
}

// Lịch thi giữa kỳ và cuối kỳ của học kỳ hiện tại cùng cán bộ coi thi, đúng id của dữ liệu mẫu. Giảng viên, khoa và số
// thí sinh không lưu ở ca thi mà lấy từ lớp học phần khi đọc.
export async function seedExams(tx: Transaction, context: SeedContext) {
  const files = EXAM_SESSIONS.map((exam) => ({ paper: samplePaper(exam, "paper"), answerKey: samplePaper(exam, "answer-key") }));
  // DB vừa bị xóa sạch nên tệp nộp ở lần chạy trước không còn ca thi nào trỏ tới.
  await deleteFiles((await listFiles("exams")).map((entry) => entry.key));
  await Promise.all(files.flatMap(({ paper, answerKey }) => [paper, answerKey]).filter((file) => file !== null).map((file) => putFile(file.key, file.data)));
  await tx.insert(examSessions).values(
    EXAM_SESSIONS.map((exam, index) => {
      const isSubmitted = exam.paperStatus !== "not-submitted";
      const deadline = dayjs(exam.paperDeadline);
      const { paper, answerKey } = files[index];
      // Đề đã nộp: nộp 2 ngày trước hạn, nhưng không sau hôm nay; đề đã xét: xét sau khi nộp 1 ngày, không sau hôm nay.
      const submittedAt = isSubmitted ? new Date(Math.min(deadline.subtract(2, "day").valueOf(), dayjs().subtract(1, "hour").valueOf())) : null;
      const reviewedAt = submittedAt && exam.paperReview ? new Date(Math.min(submittedAt.valueOf() + 24 * 60 * 60 * 1000, dayjs().subtract(10, "minute").valueOf())) : null;
      return {
        id: exam.id,
        termId: exam.termId,
        classSectionId: exam.classSectionId,
        kind: exam.kind,
        format: exam.format,
        date: exam.date,
        startTime: exam.startTime,
        durationMinutes: exam.durationMinutes,
        roomId: context.roomByCode.get(exam.room)!.id,
        status: exam.status,
        paperStatus: exam.paperStatus,
        paperDeadline: deadline.toDate(),
        paperStorageKey: paper?.key ?? null,
        paperFileName: paper?.fileName ?? null,
        paperContentType: paper ? "application/pdf" : null,
        paperSizeBytes: paper?.data.byteLength ?? null,
        answerKeyStorageKey: answerKey?.key ?? null,
        answerKeyFileName: answerKey?.fileName ?? null,
        answerKeyContentType: answerKey ? "application/pdf" : null,
        answerKeySizeBytes: answerKey?.data.byteLength ?? null,
        paperSubmittedAt: submittedAt,
        paperReviewedByUserId: reviewedAt ? context.adminUserId : null,
        paperReviewedAt: reviewedAt,
        paperReturnReason: exam.paperReview?.returnReason ?? null,
      };
    }),
  );
  const proctors = EXAM_SESSIONS.flatMap((exam) => exam.proctors.map((proctor) => ({ examSessionId: exam.id, lecturerId: proctor.id })));
  await tx.insert(examProctors).values(proctors);
  return { sessions: EXAM_SESSIONS.length, proctors: proctors.length };
}
