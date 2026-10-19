export const SURVEY_SCALE = [
  { value: 1, label: "Rất không đồng ý" },
  { value: 2, label: "Không đồng ý" },
  { value: 3, label: "Phân vân" },
  { value: 4, label: "Đồng ý" },
  { value: 5, label: "Rất đồng ý" },
];

// Điểm chung dưới ngưỡng này thì khoa cần trao đổi với giảng viên. Đặt ở đây (không ở component client) để trang server so sánh được.
export const LOW_SCORE = 3.5;

// Giảng viên chỉ xem kết quả lớp có từ ngần này phiếu, để không đoán được ai đánh giá (phiếu khảo sát hứa với sinh viên).
export const MIN_RESPONSES_FOR_LECTURER = 5;

export const SURVEYS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  survey_submissions_enrolled: "Chỉ sinh viên đang học lớp mới được đánh giá lớp đó.",
  survey_submissions_survey_id_class_section_id_student_id_pk: "Bạn đã gửi đánh giá lớp này, mỗi lớp chỉ đánh giá một lần.",
  survey_answers_score_range: "Mức đánh giá phải từ 1 đến 5.",
  survey_answers_question_id_survey_questions_id_fk: "Câu hỏi không còn trong phiếu khảo sát, tải lại trang.",
  surveys_time_order: "Thời điểm đóng khảo sát phải sau thời điểm mở.",
  survey_questions_survey_id_position_unique: "Phiếu khảo sát đã có câu hỏi ở vị trí này.",
};
