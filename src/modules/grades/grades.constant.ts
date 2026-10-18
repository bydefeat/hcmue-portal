import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AcademicStanding, GradeComponent, GradeSheetState, LetterGrade, WarningStatus } from "./grades.type";

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

export function toLetter(score10: number) {
  return LETTER_SCALE.find((step) => score10 >= step.min)!;
}

export function weightedScore(components: GradeComponent[], row: Record<string, number | null>) {
  if (components.some((component) => row[component.key] === null || row[component.key] === undefined)) return null;
  const total = components.reduce((sum, component) => sum + (row[component.key] as number) * component.weight, 0);
  return Math.round((total / 100) * 10) / 10;
}

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
  locked: { label: "Đã chốt", tone: "success" },
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

export const WARNING_RULES = [
  "Mức 1: ĐTB học kỳ dưới 1,0 hoặc nợ từ 6 tín chỉ trở lên",
  "Mức 2: CPA dưới 1,5 hoặc nợ từ 12 tín chỉ trở lên",
  "Mức 3: CPA dưới 1,0, chuyển hội đồng xét thôi học",
];

export function formatPoint(value: number | null, digits = 2) {
  return value === null ? "" : value.toFixed(digits).replace(".", ",");
}
