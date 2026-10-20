import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AcademicStanding, GradeComponent, GradeSheetState, LetterGrade, WarningStatus } from "@/modules/grades/grades.type";

// Thứ tự điểm chữ từ cao xuống thấp (để hiển thị, xếp hạng); ngưỡng và điểm thang 4 lấy theo quy chế (grading.scale).
export const LETTER_ORDER: LetterGrade[] = ["A", "B+", "B", "C+", "C", "D+", "D", "F"];

export const LETTER_COLOR: Record<LetterGrade, { text: string; fill: string }> = {
  A: { text: "text-green-700", fill: "#15803d" },
  "B+": { text: "text-green-600", fill: "#22c55e" },
  B: { text: "text-lime-700", fill: "#84cc16" },
  "C+": { text: "text-yellow-700", fill: "#eab308" },
  C: { text: "text-amber-600", fill: "#f59e0b" },
  "D+": { text: "text-orange-600", fill: "#f97316" },
  D: { text: "text-orange-700", fill: "#ea580c" },
  F: { text: "text-red-600", fill: "#dc2626" },
};

export function letterTextClass(letter: string | null | undefined) {
  return letter && letter in LETTER_COLOR ? LETTER_COLOR[letter as LetterGrade].text : "";
}

// Cột điểm mặc định khi lớp chưa có bảng điểm riêng.
export const DEFAULT_COMPONENTS: GradeComponent[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10 },
  { key: "midterm", label: "Giữa kỳ", weight: 30 },
  { key: "final", label: "Cuối kỳ", weight: 60 },
];

// Thứ tự và tên các mức xếp loại học lực; ngưỡng CPA của từng mức lấy theo quy chế (grading.standing).
export const STANDINGS: { standing: AcademicStanding; label: string }[] = [
  { standing: "excellent", label: "Xuất sắc" },
  { standing: "very-good", label: "Giỏi" },
  { standing: "good", label: "Khá" },
  { standing: "average", label: "Trung bình" },
  { standing: "weak", label: "Yếu" },
  { standing: "poor", label: "Kém" },
];

export const STANDING_LABEL = Object.fromEntries(STANDINGS.map((step) => [step.standing, step.label])) as Record<AcademicStanding, string>;

export const UNRANKED_LABEL = "Chưa xếp loại";

export function standingLabel(standing: AcademicStanding | null) {
  return standing ? STANDING_LABEL[standing] : UNRANKED_LABEL;
}

export const GRADE_SHEET_STATE: Record<GradeSheetState, StatusMeta> = {
  published: { label: "Đã công bố", tone: "success" },
  approved: { label: "Khoa đã duyệt", tone: "success" },
  locked: { label: "Đã chốt, chờ khoa duyệt", tone: "neutral" },
  returned: { label: "Khoa trả lại", tone: "danger" },
  overdue: { label: "Quá hạn nhập", tone: "danger" },
  "due-soon": { label: "Sắp hết hạn", tone: "warning" },
  "in-progress": { label: "Đang nhập", tone: "neutral" },
};

export const WARNING_LEVEL: Record<1 | 2 | 3, StatusMeta> = {
  1: { label: "Mức 1", tone: "warning" },
  2: { label: "Mức 2", tone: "danger" },
  3: { label: "Mức 3", tone: "danger" },
};

export const WARNING_STATUS: Record<WarningStatus, StatusMeta> = {
  new: { label: "Chưa xử lý", tone: "warning" },
  notified: { label: "Đã gửi thông báo", tone: "neutral" },
  resolved: { label: "Đã gặp sinh viên", tone: "success" },
};

export function formatPoint(value: number | null, digits = 2) {
  return value === null ? "" : value.toFixed(digits).replace(".", ",");
}

export const GRADES_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  grade_scores_range: "Điểm phải từ 0 đến 10.",
  grade_scores_same_section: "Sinh viên không thuộc lớp của bảng điểm.",
  course_results_enrollment_fk: "Kết quả học phần không khớp với đăng ký của sinh viên.",
  grade_components_weight_range: "Trọng số mỗi thành phần phải từ 1 đến 100%.",
  grade_components_grade_sheet_id_key_unique: "Thành phần điểm này đã có trong bảng điểm.",
  grade_sheets_class_section_id_unique: "Lớp học phần đã có bảng điểm.",
  grade_sheets_return_reason: "Ghi lý do khi trả lại bảng điểm.",
  course_results_student_id_course_id_term_id_index: "Sinh viên đã có kết quả học phần này trong học kỳ.",
  academic_warnings_student_id_term_id_unique: "Sinh viên đã có cảnh báo học vụ trong học kỳ này.",
  grade_sheets_status_flow: "Bảng điểm không còn ở bước cho phép thao tác này, tải lại trang để xem trạng thái mới.",
  grade_sheets_incomplete: "Còn điểm chưa nhập nên chưa chốt được. Nhập đủ điểm rồi chốt lại.",
  grade_sheets_locked_after_draft: "Bảng điểm đã chốt phải có thời điểm chốt.",
  grade_sheets_published_fields: "Bảng điểm đã công bố phải có thời điểm công bố.",
  grade_scores_sheet_locked: "Bảng điểm đã chốt, không sửa được điểm nữa.",
  grade_components_sheet_locked: "Bảng điểm đã chốt, không đổi được cột điểm.",
  grade_components_weights_total_100: "Tổng trọng số các cột điểm phải bằng 100%.",
  course_results_score_range: "Điểm học phần phải từ 0 đến 10.",
  course_results_point_range: "Điểm thang 4 phải từ 0 đến 4.",
  course_results_letter: "Điểm chữ không thuộc thang điểm.",
  course_results_graded_together: "Điểm thang 10, điểm chữ và điểm thang 4 phải cùng có hoặc cùng trống.",
  course_results_class_has_enrollment: "Kết quả học phần học trên lớp phải gắn với đăng ký của sinh viên.",
  academic_warnings_level_range: "Mức cảnh báo học vụ từ 1 đến 3.",
  academic_warnings_has_reason: "Cảnh báo học vụ phải ghi lý do.",
  academic_warnings_handled_locked: "Cảnh báo đã gửi thông báo hoặc đã xử lý, không đổi được mức và lý do.",
  grade_components_grade_sheet_id_position_unique: "Thứ tự cột điểm bị trùng, tải lại trang rồi sửa lại.",
};
