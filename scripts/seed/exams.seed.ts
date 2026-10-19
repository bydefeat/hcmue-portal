import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import { examPaperStorageKey } from "@/modules/exams/exams.rule";
import { examProctors, examSessions } from "@/modules/exams/exams.schema";
import type { SeedContext } from "./context";

// Lịch thi giữa kỳ và cuối kỳ của học kỳ hiện tại cùng cán bộ coi thi, đúng id của dữ liệu mẫu. Giảng viên, khoa và số
// thí sinh không lưu ở ca thi mà lấy từ lớp học phần khi đọc.
export async function seedExams(tx: Transaction, context: SeedContext) {
  await tx.insert(examSessions).values(
    EXAM_SESSIONS.map((exam) => {
      const isSubmitted = exam.paperStatus !== "not-submitted";
      const deadline = dayjs(exam.paperDeadline);
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
        paperStorageKey: isSubmitted ? examPaperStorageKey(exam.id, "seed") : null,
        // Đề đã nộp: nộp 2 ngày trước hạn, nhưng không sau hôm nay.
        paperSubmittedAt: isSubmitted ? new Date(Math.min(deadline.subtract(2, "day").valueOf(), dayjs().subtract(1, "hour").valueOf())) : null,
      };
    }),
  );
  const proctors = EXAM_SESSIONS.flatMap((exam) => exam.proctors.map((proctor) => ({ examSessionId: exam.id, lecturerId: proctor.id })));
  await tx.insert(examProctors).values(proctors);
  return { sessions: EXAM_SESSIONS.length, proctors: proctors.length };
}
