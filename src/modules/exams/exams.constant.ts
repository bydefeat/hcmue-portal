import type { StatusMeta } from "@/shared/constants/status.constant";
import type { ExamConflict, ExamFormat, ExamKind, ExamPaperStatus, ExamSession, ExamSessionStatus } from "@/modules/exams/exams.type";

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  midterm: "Giữa kỳ",
  final: "Cuối kỳ",
};

export const EXAM_FORMAT_LABEL: Record<ExamFormat, string> = {
  written: "Tự luận",
  "multiple-choice": "Trắc nghiệm",
  practical: "Thực hành trên máy",
  oral: "Vấn đáp",
  project: "Báo cáo đồ án",
};

export const EXAM_STATUS: Record<ExamSessionStatus, StatusMeta> = {
  draft: { label: "Dự kiến", tone: "neutral" },
  published: { label: "Đã công bố", tone: "success" },
  done: { label: "Đã thi", tone: "neutral" },
};

export const EXAM_PAPER_STATUS: Record<ExamPaperStatus, StatusMeta> = {
  "not-submitted": { label: "Chưa nộp đề", tone: "warning" },
  submitted: { label: "Đã nộp, chờ duyệt", tone: "neutral" },
  approved: { label: "Đề đã duyệt", tone: "success" },
};

export const PROCTORS_PER_ROOM = 2;

export const EXAM_KIND_OPTIONS = Object.entries(EXAM_KIND_LABEL).map(([value, label]) => ({ value, label }));

export const EXAM_FORMAT_OPTIONS = Object.entries(EXAM_FORMAT_LABEL).map(([value, label]) => ({ value, label }));

export function examConflicts(sessions: ExamSession[]): ExamConflict[] {
  const conflicts: ExamConflict[] = [];
  for (const session of sessions) {
    for (const other of sessions) {
      if (other.id === session.id || other.date !== session.date || other.startTime !== session.startTime) continue;
      if (other.room === session.room) conflicts.push({ examId: session.id, message: `Trùng phòng ${session.room} với ${other.classCode}` });
      const shared = session.proctors.find((proctor) => other.proctors.some((entry) => entry.id === proctor.id));
      if (shared) conflicts.push({ examId: session.id, message: `${shared.name} coi thi trùng ca với ${other.classCode}` });
    }
  }
  return conflicts;
}
