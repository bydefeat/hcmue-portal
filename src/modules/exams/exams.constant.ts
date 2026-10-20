import type { StatusMeta } from "@/shared/constants/status.constant";
import { MB, type UploadKind } from "@/shared/libs/upload.lib";
import type { ExamFormat, ExamKind, ExamPaperFileKind, ExamPaperStatus, ExamSessionStatus, ExamSwapDecision } from "@/modules/exams/exams.type";

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  midterm: "Giữa kỳ",
  final: "Cuối kỳ",
  makeup: "Thi bù",
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
  returned: { label: "Bị trả lại, cần nộp lại", tone: "danger" },
};

// Lý do trả lại đề (DB chặn bằng exam_sessions_paper_return_reason).
export const EXAM_RETURN_REASON_MAX = 500;

export const LECTURER_EXAMS_HREF = "/lecturer/exams";

export const EXAM_SWAP_DECISION: Record<ExamSwapDecision, StatusMeta> = {
  accepted: { label: "Đã đổi ca", tone: "success" },
  rejected: { label: "Không đồng ý", tone: "danger" },
  withdrawn: { label: "Không còn hiệu lực", tone: "neutral" },
};

export const ADMIN_EXAMS_HREF = "/administrator/exams";

export const STUDENT_EXAMS_HREF = "/application/exams";

// Mỗi phòng thi ít nhất 2 cán bộ coi thi (quy chế thi), tối đa 4.
export const PROCTORS_PER_ROOM = 2;
export const MAX_PROCTORS_PER_ROOM = 4;

// Giờ bắt đầu các ca thi của trường (giờ Việt Nam); form chọn trong danh sách này, server cũng chỉ nhận các giờ này.
export const EXAM_START_TIMES = ["07:30", "09:30", "13:30", "15:30", "17:30"] as const;

// Đề thi và đáp án: mỗi tệp một PDF tối đa 20 MB (DB chặn bằng exam_sessions_paper_size_range).
export const EXAM_PAPER_LIMIT = { bytes: 20 * MB, kinds: ["pdf"] as UploadKind[] };

export const EXAM_PAPER_FILE_LABEL: Record<ExamPaperFileKind, string> = {
  paper: "Đề thi",
  "answer-key": "Đáp án, thang điểm",
};

export function examPaperHref(examSessionId: string, kind: ExamPaperFileKind) {
  return `/api/files/exams/${examSessionId}/${kind}`;
}

export const EXAM_FORMAT_OPTIONS = Object.entries(EXAM_FORMAT_LABEL).map(([value, label]) => ({ value, label }));

export const EXAMS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  exam_sessions_duration_range: "Thời gian làm bài phải từ 15 đến 240 phút.",
  exam_sessions_paper_fields: "Đề thi đã nộp phải có đủ tệp đề, tệp đáp án và thời điểm nộp; đề chưa nộp thì không có tệp.",
  exam_sessions_paper_size_range: "Mỗi tệp đề thi, đáp án từ 1 byte đến 20 MB.",
  exam_sessions_paper_review_fields: "Đề đã duyệt hoặc bị trả lại phải có thời điểm xét; đề chưa xét thì không có người duyệt.",
  exam_sessions_paper_return_reason: "Đề bị trả lại phải có lý do (tối đa 500 ký tự); đề không bị trả lại thì không có lý do.",
  exam_sessions_paper_locked: "Đề thi đã được duyệt nên đã khóa, không nộp lại hay đổi trạng thái được.",
  exam_sessions_paper_reviewed_by_user_id_user_id_fk: "Tài khoản người duyệt đề không còn trong hệ thống.",
  exam_sessions_paper_storage_key_unique: "Tệp đề thi bị trùng khóa lưu trữ. Nộp lại.",
  exam_sessions_answer_key_storage_key_unique: "Tệp đáp án bị trùng khóa lưu trữ. Nộp lại.",
  exam_sessions_paper_after_start: "Ca thi đã bắt đầu, không nộp đề được nữa.",
  exam_sessions_class_section_id_kind_unique: "Lớp này đã có ca thi cùng loại (giữa kỳ hoặc cuối kỳ).",
  exam_sessions_paper_deadline_before_exam: "Hạn nộp đề phải trước giờ thi.",
  exam_sessions_makeup_of: "Ca thi bù phải chọn ca gốc; ca giữa kỳ, cuối kỳ thì không.",
  exam_sessions_makeup_of_fk: "Ca gốc của ca thi bù phải là ca thi của cùng lớp.",
  exam_session_rooms_exam_session_id_room_id_unique: "Một phòng chỉ chọn một lần trong ca thi.",
  exam_session_rooms_room_id_rooms_id_fk: "Phòng thi không còn trong danh mục.",
  exam_proctors_exam_session_id_lecturer_id_pk: "Một cán bộ chỉ được phân công một lần trong cùng ca thi.",
  exam_proctors_room_fk: "Phòng coi thi không thuộc ca thi này.",
  exam_candidates_exam_session_id_enrollment_id_pk: "Sinh viên đã có trong danh sách thi của ca này.",
  exam_candidates_exam_session_id_candidate_number_unique: "Hai thí sinh trùng số báo danh.",
  exam_deferrals_enrollment_id_kind_unique: "Sinh viên đã được ghi nhận hoãn kỳ thi này.",
  exam_deferrals_reason_present: "Chưa nhập lý do hoãn thi (tối đa 300 ký tự).",
  exam_eligibility_overrides_revoke_fields: "Thu hồi quyết định cho dự thi phải có lý do và thời điểm.",
  exam_proctor_swap_requests_resolved_fields: "Đề nghị đã xử lý phải có kết quả.",
  exam_proctors_lecturer_id_lecturers_id_fk: "Cán bộ coi thi không còn trong danh sách giảng viên.",
  exam_eligibility_overrides_enrollment_id_unique: "Sinh viên đã được cho dự thi học phần này.",
  exam_proctor_swap_requests_single_pending: "Bạn đã gửi đề nghị đổi ca này, đang chờ Phòng Khảo thí xử lý.",
  exam_proctor_swap_requests_distinct_people: "Người coi thay phải là người khác.",
  exam_proctor_swap_requests_reason_present: "Chưa nhập lý do đổi ca.",
  exam_proctor_swap_requests_proctor_fk: "Bạn không còn được phân công coi ca thi này.",
  exam_proctor_swap_requests_requester_id_lecturers_id_fk: "Người gửi không còn trong danh sách giảng viên.",
};
