import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AcademicStanding, GradeComponent, GradeSheetState, LetterGrade, WarningStatus } from "@/modules/grades/grades.type";

export const LETTER_SCALE: { min: number; letter: LetterGrade; point4: number }[] = [
  { min: 8.5, letter: "A", point4: 4 },
  { min: 8, letter: "B+", point4: 3.5 },
  { min: 7, letter: "B", point4: 3 },
  { min: 6.5, letter: "C+", point4: 2.5 },
  { min: 5.5, letter: "C", point4: 2 },
  { min: 5, letter: "D+", point4: 1.5 },
  { min: 4, letter: "D", point4: 1 },
  { min: 0, letter: "F", point4: 0 },
];

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

export function toLetter(score10: number) {
  return LETTER_SCALE.find((step) => score10 >= step.min)!;
}

export function weightedScore(components: GradeComponent[], row: Record<string, number | null>) {
  if (components.some((component) => row[component.key] === null || row[component.key] === undefined)) return null;
  const total = components.reduce((sum, component) => sum + (row[component.key] as number) * component.weight, 0);
  return Math.round((total / 100) * 10) / 10;
}

// Cột điểm mặc định khi lớp chưa có bảng điểm riêng.
export const DEFAULT_COMPONENTS: GradeComponent[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10 },
  { key: "midterm", label: "Giữa kỳ", weight: 30 },
  { key: "final", label: "Cuối kỳ", weight: 60 },
];

// Hạn nhập điểm mặc định: 14 ngày sau ngày kết thúc học kỳ.
export const DEFAULT_DEADLINE_DAYS = 14;

export const STANDING_SCALE: { min: number; standing: AcademicStanding; label: string }[] = [
  { min: 3.6, standing: "excellent", label: "Xuất sắc" },
  { min: 3.2, standing: "very-good", label: "Giỏi" },
  { min: 2.5, standing: "good", label: "Khá" },
  { min: 2, standing: "average", label: "Trung bình" },
  { min: 1, standing: "weak", label: "Yếu" },
  { min: 0, standing: "poor", label: "Kém" },
];

export const STANDING_LABEL = Object.fromEntries(STANDING_SCALE.map((step) => [step.standing, step.label])) as Record<
  AcademicStanding,
  string
>;

export function toStanding(cpa4: number) {
  return STANDING_SCALE.find((step) => cpa4 >= step.min)!.standing;
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

export const DUE_SOON_DAYS = 5;

export const WARNING_LEVEL: Record<1 | 2 | 3, StatusMeta> = {
  1: { label: "Mức 1", tone: "warning" },
  2: { label: "Mức 2", tone: "danger" },
  3: { label: "Mức 3, xét thôi học", tone: "danger" },
};

export const WARNING_STATUS: Record<WarningStatus, StatusMeta> = {
  new: { label: "Chưa xử lý", tone: "warning" },
  notified: { label: "Đã gửi thông báo", tone: "neutral" },
  resolved: { label: "Đã gặp sinh viên", tone: "success" },
};

export const WARNING_THRESHOLD = { termGpa: 1, cpaLevel2: 1.5, cpaLevel3: 1, failedLevel1: 6, failedLevel2: 12 } as const;

export const WARNING_RULES = [
  "Mức 1: ĐTB học kỳ dưới 1,0 hoặc nợ từ 6 tín chỉ trở lên",
  "Mức 2: CPA dưới 1,5 hoặc nợ từ 12 tín chỉ trở lên",
  "Mức 3: CPA dưới 1,0, chuyển hội đồng xét thôi học",
];

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
