import { z } from "zod";
import { dayjs } from "@/shared/libs/date.lib";
import { DUE_SOON_DAYS, formatPoint, STANDING_SCALE, toLetter, toStanding, WARNING_THRESHOLD } from "@/modules/grades/grades.constant";
import type {
  AcademicStanding,
  FacultyStandingSummary,
  GradeSheet,
  GradeSheetState,
  GradeSheetSummary,
  GradeSheetStatus,
  StudentStanding,
  TranscriptCourse,
  TranscriptTerm,
  WarningStatus,
} from "@/modules/grades/grades.type";

export type TranscriptTermInput = Pick<TranscriptTerm, "termId" | "termName" | "isInProgress" | "courses">;

// Điểm trung bình có trọng số tín chỉ, làm tròn 2 chữ số; chỉ tính học phần đã có điểm.
export function creditAverage(courses: Pick<TranscriptCourse, "credits" | "point4" | "score10">[], key: "point4" | "score10") {
  const graded = courses.filter((course) => course[key] !== null);
  const credits = graded.reduce((sum, course) => sum + course.credits, 0);
  if (credits === 0) return null;
  return Math.round((graded.reduce((sum, course) => sum + (course[key] as number) * course.credits, 0) / credits) * 100) / 100;
}

// GPA từng kỳ và CPA tích lũy đến hết kỳ đó. CPA tính mọi lần học (kể cả lần trượt), kỳ đang học không có CPA.
export function buildTranscript(terms: TranscriptTermInput[]): TranscriptTerm[] {
  const accumulated: TranscriptCourse[] = [];
  return terms.map((term) => {
    accumulated.push(...term.courses.filter((course) => course.point4 !== null));
    const attemptedCredits = term.courses.reduce((sum, course) => sum + course.credits, 0);
    const earnedCredits = term.courses.filter((course) => (course.point4 ?? 0) > 0).reduce((sum, course) => sum + course.credits, 0);
    return {
      ...term,
      attemptedCredits,
      earnedCredits: term.isInProgress ? 0 : earnedCredits,
      gpa4: creditAverage(term.courses, "point4"),
      gpa10: creditAverage(term.courses, "score10"),
      cpa4: term.isInProgress ? null : creditAverage(accumulated, "point4"),
    };
  });
}

export function warningLevelOf(input: { hasCourses: boolean; cpa4: number; failedCredits: number; lastTermGpa4: number | null }): 0 | 1 | 2 | 3 {
  if (!input.hasCourses) return 0;
  if (input.cpa4 < WARNING_THRESHOLD.cpaLevel3) return 3;
  if (input.cpa4 < WARNING_THRESHOLD.cpaLevel2 || input.failedCredits >= WARNING_THRESHOLD.failedLevel2) return 2;
  if ((input.lastTermGpa4 !== null && input.lastTermGpa4 < WARNING_THRESHOLD.termGpa) || input.failedCredits >= WARNING_THRESHOLD.failedLevel1) return 1;
  return 0;
}

// Xếp loại và mức cảnh báo chỉ tính các kỳ đã kết thúc.
export function computeStanding(studentId: string, transcript: TranscriptTerm[]): StudentStanding {
  const completed = transcript.filter((term) => !term.isInProgress);
  const courses = completed.flatMap((term) => term.courses);
  const cpa4 = creditAverage(courses, "point4") ?? 0;
  const cpa10 = creditAverage(courses, "score10") ?? 0;
  const failedCredits = courses.filter((course) => course.letter === "F").reduce((sum, course) => sum + course.credits, 0);
  const lastTerm = completed.filter((term) => term.courses.length > 0).at(-1);
  const lastTermGpa4 = lastTerm?.gpa4 ?? 0;
  return {
    studentId,
    cpa4,
    cpa10,
    earnedCredits: completed.reduce((sum, term) => sum + term.earnedCredits, 0),
    failedCredits,
    lastTermGpa4,
    standing: toStanding(cpa4),
    warningLevel: warningLevelOf({ hasCourses: courses.length > 0, cpa4, failedCredits, lastTermGpa4: lastTerm ? lastTermGpa4 : null }),
  };
}

export function warningReasons(standing: Pick<StudentStanding, "cpa4" | "lastTermGpa4" | "failedCredits">) {
  const reasons: string[] = [];
  if (standing.cpa4 < WARNING_THRESHOLD.cpaLevel2) reasons.push(`CPA ${formatPoint(standing.cpa4)} dưới ngưỡng 1,5`);
  if (standing.lastTermGpa4 < WARNING_THRESHOLD.termGpa) reasons.push(`ĐTB học kỳ gần nhất ${formatPoint(standing.lastTermGpa4)}`);
  if (standing.failedCredits >= WARNING_THRESHOLD.failedLevel1) reasons.push(`Nợ ${standing.failedCredits} tín chỉ`);
  return reasons;
}

export function summarizeStandings(entries: { faculty: string; standing: StudentStanding }[]): FacultyStandingSummary[] {
  const summary = new Map<string, FacultyStandingSummary & { cpaTotal: number }>();
  for (const { faculty, standing } of entries) {
    const entry =
      summary.get(faculty) ??
      ({
        faculty,
        total: 0,
        averageCpa: 0,
        cpaTotal: 0,
        warnings: 0,
        counts: Object.fromEntries(STANDING_SCALE.map((step) => [step.standing, 0])) as Record<AcademicStanding, number>,
      } satisfies FacultyStandingSummary & { cpaTotal: number });
    entry.total += 1;
    entry.cpaTotal += standing.cpa4;
    entry.counts[standing.standing] += 1;
    if (standing.warningLevel > 0) entry.warnings += 1;
    summary.set(faculty, entry);
  }
  return [...summary.values()].map(({ cpaTotal, ...entry }) => ({ ...entry, averageCpa: Math.round((cpaTotal / entry.total) * 100) / 100 }));
}

// Trạng thái hiển thị: bảng điểm chưa chốt thì suy từ hạn nhập so với hiện tại.
export function sheetState(status: GradeSheetStatus, deadline: string, now = dayjs()): GradeSheetState {
  if (status === "published" || status === "approved" || status === "locked" || status === "returned") return status;
  if (now.isAfter(deadline)) return "overdue";
  if (dayjs(deadline).startOf("day").diff(now.startOf("day"), "day") <= DUE_SOON_DAYS) return "due-soon";
  return "in-progress";
}

export function sheetSummary(sheet: GradeSheet & { state: GradeSheetState }): GradeSheetSummary {
  const values = Object.values(sheet.scores).flatMap((row) => Object.values(row));
  return {
    classSectionId: sheet.classSectionId,
    status: sheet.status,
    state: sheet.state,
    deadline: sheet.deadline,
    filledCells: values.filter((value) => value !== null).length,
    totalCells: values.length,
  };
}

// Điểm tổng kết học phần (thang 10, một chữ số) đổi sang điểm chữ và thang 4.
export function courseGrade(score10: number) {
  const step = toLetter(score10);
  return { score10, letter: step.letter, point4: step.point4 };
}

export const NEXT_WARNING_STATUS: Partial<Record<WarningStatus, WarningStatus>> = { new: "notified", notified: "resolved" };

const score = z
  .number("Điểm phải là số")
  .min(0, "Điểm từ 0 đến 10")
  .max(10, "Điểm từ 0 đến 10")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "Điểm lấy tối đa 2 chữ số thập phân");

// Dùng chung cho bảng nhập điểm và server action; DB còn chặn bằng grade_scores_range và grade_scores_sheet_locked.
export const GRADE_SCORES_SAVE_SCHEMA = z.object({
  classSectionId: z.uuid(),
  changes: z
    .array(z.object({ studentId: z.uuid(), key: z.string().trim().min(1).max(40), score: score.nullable() }))
    .min(1, "Không có điểm nào thay đổi")
    .max(5000, "Lưu tối đa 5000 ô mỗi lần"),
});

export type GradeScoresSaveInput = z.input<typeof GRADE_SCORES_SAVE_SCHEMA>;

export const GRADE_SHEET_SCHEMA = z.object({ classSectionId: z.uuid() });

export const GRADE_SHEETS_SCHEMA = z.object({
  classSectionIds: z
    .array(z.uuid())
    .min(1, "Chưa chọn bảng điểm nào")
    .max(500, "Chọn tối đa 500 bảng điểm mỗi lần")
    .transform((ids) => [...new Set(ids)]),
});

export const GRADE_SHEET_RETURN_SCHEMA = z.object({
  classSectionId: z.uuid(),
  reason: z.string().trim().min(1, "Ghi lý do trả lại để giảng viên biết cần sửa gì").max(300, "Tối đa 300 ký tự"),
});

export type GradeSheetReturnInput = z.input<typeof GRADE_SHEET_RETURN_SCHEMA>;

export const WARNING_ADVANCE_SCHEMA = z.object({ id: z.uuid(), from: z.enum(["new", "notified"]) });
