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

export const MAX_GRADE_COMPONENTS = 8;

// Cột điểm gửi lên khi sửa: key của cột đang có (giữ nguyên điểm), null là cột mới. DB chặn thêm bằng grade_components_weights_total_100
// (kiểm lúc commit) và grade_components_sheet_locked.
export const GRADE_COMPONENTS_SAVE_SCHEMA = z.object({
  classSectionId: z.uuid(),
  components: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40).nullable(),
        label: z.string().trim().min(1, "Chưa nhập tên cột").max(40, "Tối đa 40 ký tự"),
        weight: z.int("Trọng số là số nguyên").min(1, "Trọng số từ 1%").max(100, "Trọng số tối đa 100%"),
      }),
    )
    .min(1, "Bảng điểm cần ít nhất một cột điểm")
    .max(MAX_GRADE_COMPONENTS, `Tối đa ${MAX_GRADE_COMPONENTS} cột điểm`)
    .refine((components) => new Set(components.map((component) => component.label.toLowerCase())).size === components.length, "Tên các cột điểm không được trùng nhau")
    .refine((components) => new Set(components.flatMap((component) => (component.key ? [component.key] : []))).size === components.filter((component) => component.key).length, "Cột điểm bị lặp, tải lại trang")
    .refine((components) => components.reduce((sum, component) => sum + component.weight, 0) === 100, "Tổng trọng số các cột điểm phải bằng 100%"),
  confirmDropScores: z.boolean().default(false),
});

export type GradeComponentsSaveInput = z.input<typeof GRADE_COMPONENTS_SAVE_SCHEMA>;

// Khóa của cột mới sinh từ tên cột (không dấu), thêm số nếu trùng với cột đang có.
export function componentKey(label: string, taken: Set<string>) {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "cot";
  let key = base;
  for (let suffix = 2; taken.has(key); suffix += 1) key = `${base}-${suffix}`;
  return key;
}

type ExistingComponent = { id: string; key: string };
type NextComponent = { key: string | null; label: string; weight: number };

// Chia danh sách cột mới thành cột bỏ, cột giữ (đổi tên, trọng số, thứ tự) và cột thêm. Cột giữ giữ nguyên key nên điểm đã nhập còn nguyên.
export function planComponentChanges(existing: ExistingComponent[], next: NextComponent[]) {
  const byKey = new Map(existing.map((component) => [component.key, component]));
  const unknown = next.filter((component) => component.key !== null && !byKey.has(component.key)).map((component) => component.key!);
  const keptKeys = new Set(next.flatMap((component) => (component.key ? [component.key] : [])));
  const taken = new Set(existing.map((component) => component.key));
  const kept: (NextComponent & { id: string; key: string; position: number })[] = [];
  const created: (NextComponent & { key: string; position: number })[] = [];
  next.forEach((component, index) => {
    const position = index + 1;
    const current = component.key ? byKey.get(component.key) : undefined;
    if (current) {
      kept.push({ ...component, id: current.id, key: current.key, position });
      return;
    }
    const key = componentKey(component.label, taken);
    taken.add(key);
    created.push({ ...component, key, position });
  });
  return { unknown, removed: existing.filter((component) => !keptKeys.has(component.key)), kept, created };
}

export type ScoreMatrixStudent = { studentId: string; studentCode: string };

export type ScoreChange = { studentId: string; key: string; score: number | null };

const digitsOf = (code: string) => code.replace(/\D/g, "");

// Đọc bảng điểm theo mẫu đã xuất (CSV hoặc Excel, đã đổi thành ma trận chữ): dòng đầu là tiêu đề, cột 1 MSSV, cột 2 họ tên,
// rồi các cột điểm theo đúng thứ tự của bảng điểm. Ô trống thì giữ điểm đang có; dòng lỗi ghi rõ số dòng.
export function parseScoreMatrix(matrix: string[][], components: { key: string; label: string }[], students: ScoreMatrixStudent[]) {
  const [header, ...rows] = matrix;
  const errors: string[] = [];
  const changes: ScoreChange[] = [];
  const mismatched = components.filter((component, index) => !header?.[index + 2]?.trim().startsWith(component.label));
  if (!header || mismatched.length > 0) return { changes, errors: ["Tệp không đúng mẫu: dùng tệp xuất từ nút Xuất Excel của chính bảng điểm này."] };
  const byCode = new Map(students.map((student) => [digitsOf(student.studentCode), student]));
  const seen = new Set<string>();
  rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((cell) => !cell.trim())) return;
    const student = byCode.get(digitsOf(cells[0] ?? ""));
    if (!student) {
      errors.push(`Dòng ${line}: MSSV ${cells[0]?.trim() || "(trống)"} không có trong lớp`);
      return;
    }
    if (seen.has(student.studentId)) {
      errors.push(`Dòng ${line}: MSSV ${cells[0].trim()} lặp lại, chỉ lấy dòng đầu`);
      return;
    }
    seen.add(student.studentId);
    components.forEach((component, column) => {
      const raw = (cells[column + 2] ?? "").trim();
      if (!raw) return;
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value < 0 || value > 10) {
        errors.push(`Dòng ${line}: ${component.label} "${raw}" phải là số từ 0 đến 10`);
        return;
      }
      changes.push({ studentId: student.studentId, key: component.key, score: Math.round(value * 100) / 100 });
    });
  });
  return { changes, errors };
}

// Server action nhận tối đa 1 MB (mặc định của Next); bảng điểm một lớp chỉ vài chục KB.
export const GRADE_IMPORT_MAX_BYTES = 900 * 1024;

// Cảnh báo học vụ của một sinh viên sau một học kỳ, null nếu không dưới ngưỡng.
export function academicWarningOf(standing: StudentStanding) {
  if (standing.warningLevel === 0) return null;
  return {
    level: standing.warningLevel,
    termGpa4: standing.lastTermGpa4,
    cpa4: standing.cpa4,
    failedCredits: standing.failedCredits,
    reasons: warningReasons(standing),
  };
}

export type ComputedWarning = NonNullable<ReturnType<typeof academicWarningOf>> & { studentId: string };

type StoredWarning = Omit<ComputedWarning, "level"> & { id: string; level: number; status: WarningStatus };

function sameWarning(stored: StoredWarning, computed: ComputedWarning) {
  return (
    stored.level === computed.level &&
    stored.termGpa4 === computed.termGpa4 &&
    stored.cpa4 === computed.cpa4 &&
    stored.failedCredits === computed.failedCredits &&
    stored.reasons.join("|") === computed.reasons.join("|")
  );
}

// Sinh lại cảnh báo một học kỳ: thêm sinh viên mới dưới ngưỡng; cảnh báo chưa xử lý thì cập nhật theo điểm mới, bỏ nếu nay đã đạt;
// cảnh báo đã gửi thông báo hoặc đã gặp sinh viên thì giữ nguyên.
export function planWarningSync(stored: StoredWarning[], computed: ComputedWarning[]) {
  const storedOf = new Map(stored.map((warning) => [warning.studentId, warning]));
  const computedOf = new Map(computed.map((warning) => [warning.studentId, warning]));
  const create = computed.filter((warning) => !storedOf.has(warning.studentId));
  const update: (ComputedWarning & { id: string })[] = [];
  const remove: string[] = [];
  let unchanged = 0;
  let handled = 0;
  for (const warning of stored) {
    if (warning.status !== "new") {
      handled += 1;
      continue;
    }
    const next = computedOf.get(warning.studentId);
    if (!next) remove.push(warning.id);
    else if (sameWarning(warning, next)) unchanged += 1;
    else update.push({ ...next, id: warning.id });
  }
  return { create, update, remove, unchanged, handled };
}

// Học kỳ để xét cảnh báo: học kỳ chính (1, 2) đã kết thúc gần nhất. Học kỳ hè chỉ học lại, học vượt nên không xét riêng.
export function isWarningTerm(term: { semester: number; endDate: string }, today: string) {
  return term.semester !== 3 && term.endDate < today;
}

export function latestWarningTerm<T extends { semester: number; endDate: string }>(terms: T[], today: string): T | null {
  return terms.filter((term) => isWarningTerm(term, today)).toSorted((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

export const ACADEMIC_WARNING_GENERATE_SCHEMA = z.object({ termId: z.uuid("Chọn học kỳ") });
