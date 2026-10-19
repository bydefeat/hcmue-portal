import type { StatusMeta } from "@/shared/constants/status.constant";
import { MB, type UploadKind } from "@/shared/libs/upload.lib";
import type { ExamConflict, ExamFormat, ExamKind, ExamPaperFileKind, ExamPaperStatus, ExamSession, ExamSessionStatus } from "@/modules/exams/exams.type";

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

// Đề thi và đáp án: mỗi tệp một PDF tối đa 20 MB (DB chặn bằng exam_sessions_paper_size_range).
export const EXAM_PAPER_LIMIT = { bytes: 20 * MB, kinds: ["pdf"] as UploadKind[] };

export const EXAM_PAPER_FILE_LABEL: Record<ExamPaperFileKind, string> = {
  paper: "Đề thi",
  "answer-key": "Đáp án, thang điểm",
};

export function examPaperHref(examSessionId: string, kind: ExamPaperFileKind) {
  return `/api/files/exams/${examSessionId}/${kind}`;
}

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

export const EXAMS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  exam_sessions_duration_range: "Thời gian làm bài phải từ 15 đến 240 phút.",
  exam_sessions_paper_fields: "Đề thi đã nộp phải có đủ tệp đề, tệp đáp án và thời điểm nộp; đề chưa nộp thì không có tệp.",
  exam_sessions_paper_size_range: "Mỗi tệp đề thi, đáp án từ 1 byte đến 20 MB.",
  exam_sessions_paper_storage_key_unique: "Tệp đề thi bị trùng khóa lưu trữ. Nộp lại.",
  exam_sessions_answer_key_storage_key_unique: "Tệp đáp án bị trùng khóa lưu trữ. Nộp lại.",
  exam_sessions_class_section_id_kind_unique: "Lớp này đã có ca thi cùng loại (giữa kỳ hoặc cuối kỳ).",
  exam_sessions_room_id_rooms_id_fk: "Phòng thi không còn trong danh mục.",
  exam_proctors_exam_session_id_lecturer_id_pk: "Một cán bộ chỉ được phân công một lần trong cùng ca thi.",
  exam_proctors_lecturer_id_lecturers_id_fk: "Cán bộ coi thi không còn trong danh sách giảng viên.",
  exam_eligibility_overrides_enrollment_id_unique: "Sinh viên đã được cho dự thi học phần này.",
  exam_proctor_swap_requests_single_pending: "Bạn đã gửi đề nghị đổi ca này, đang chờ Phòng Khảo thí xử lý.",
  exam_proctor_swap_requests_distinct_people: "Người coi thay phải là người khác.",
  exam_proctor_swap_requests_reason_present: "Chưa nhập lý do đổi ca.",
  exam_proctor_swap_requests_proctor_fk: "Bạn không còn được phân công coi ca thi này.",
};
