import type { StatusMeta } from "@/shared/constants/status.constant";
import type { SurveyStatus } from "@/modules/surveys/surveys.type";

export const SURVEY_SCALE = [
  { value: 1, label: "Rất không đồng ý" },
  { value: 2, label: "Không đồng ý" },
  { value: 3, label: "Phân vân" },
  { value: 4, label: "Đồng ý" },
  { value: 5, label: "Rất đồng ý" },
];

export const SURVEY_STATUS: Record<SurveyStatus, StatusMeta> = {
  upcoming: { label: "Chưa mở", tone: "neutral" },
  open: { label: "Đang mở", tone: "success" },
  closed: { label: "Đã đóng", tone: "neutral" },
};

export const LOW_SCORE = 3.5;

export const MIN_RESPONSES_FOR_LECTURER = 5;

export const SURVEY_REMIND_GAP_HOURS = 24;

export const STUDENT_SURVEYS_HREF = "/application/surveys";

export const SURVEYS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  survey_submissions_enrolled: "Chỉ sinh viên đang học lớp mới được đánh giá lớp đó.",
  survey_submissions_survey_id_class_section_id_student_id_pk: "Bạn đã gửi đánh giá lớp này, mỗi lớp chỉ đánh giá một lần.",
  survey_answers_score_range: "Mức đánh giá phải từ 1 đến 5.",
  survey_answers_question_id_survey_questions_id_fk: "Câu hỏi không còn trong phiếu khảo sát, tải lại trang.",
  surveys_time_order: "Thời điểm đóng khảo sát phải sau thời điểm mở.",
  surveys_title_present: "Tên đợt khảo sát từ 1 đến 200 ký tự.",
  surveys_term_id_terms_id_fk: "Học kỳ không còn trong danh mục.",
  survey_questions_survey_id_position_unique: "Phiếu khảo sát đã có câu hỏi ở vị trí này.",
  survey_questions_text_present: "Câu hỏi và nhóm câu hỏi không được để trống.",
  survey_questions_locked: "Đợt khảo sát đã có phiếu trả lời nên không sửa câu hỏi được.",
};
