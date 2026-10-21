import { z } from "zod";
import { dayjs, schoolTime } from "@/shared/libs/date.lib";
import { formatPoint, RESULT_MARK_NOTE, STANDINGS } from "@/modules/grades/grades.constant";
import type {
  AcademicStanding,
  FacultyStandingSummary,
  GradeComponent,
  GradeSheet,
  GradeSheetState,
  GradeSheetSummary,
  GradeSheetStatus,
  GradingRules,
  LetterGrade,
  ResultMark,
  StudentStanding,
  TranscriptCourse,
  TranscriptCourseInput,
  TranscriptTerm,
  WarningStatus,
} from "@/modules/grades/grades.type";
import type { RegulationSettings, StandingThresholds } from "@/modules/settings/settings.type";

export type TranscriptTermInput = Pick<TranscriptTerm, "termId" | "termName" | "isInProgress"> & { courses: TranscriptCourseInput[] };

export type WarningThresholds = RegulationSettings["warning"];

export type StandingRules = { standing: StandingThresholds; warning: WarningThresholds };

export function standingRulesOf(rules: { grading: { standing: StandingThresholds }; warning: WarningThresholds }): StandingRules {
  return { standing: rules.grading.standing, warning: rules.warning };
}


export function weightedScore(components: GradeComponent[], row: Record<string, number | null>, roundingStep: number) {
  if (components.some((component) => row[component.key] === null || row[component.key] === undefined)) return null;
  const units = components.reduce((sum, component) => sum + Math.round((row[component.key] as number) * 100) * component.weight, 0);
  const step = Math.round(roundingStep * 10000);
  return (Math.floor((units + step / 2) / step) * step) / 10000;
}

export function roundingFormula(weightedSum: string, roundingStep: number) {
  const perPoint = Math.round(1 / roundingStep);
  return perPoint === 10 ? `ROUND(ROUND(${weightedSum},6)/100,1)` : `ROUND(ROUND(${weightedSum},6)/100*${perPoint},0)/${perPoint}`;
}

export function letterOf(score10: number, scale: GradingRules["scale"]) {
  const step = scale.find((entry) => score10 >= entry.min) ?? scale.at(-1)!;
  return { letter: step.letter as LetterGrade, point4: step.point4 };
}

export function courseGrade(score10: number, scale: GradingRules["scale"]) {
  return { score10, ...letterOf(score10, scale) };
}


export function hasResult(course: { letter: string | null; point4: number | null }) {
  return course.point4 !== null || course.letter === "M";
}

export function countsAsAttempted(course: { letter: string | null }) {
  return course.letter !== "W" && course.letter !== "M";
}

export function isPassing(course: { letter: string | null; point4: number | null }) {
  if (course.letter === "M") return true;
  return course.point4 !== null && course.letter !== null && course.letter !== "F";
}


export function countsTowardAverage(course: { isConditional?: boolean }) {
  return !course.isConditional;
}

export const CONDITIONAL_COURSE_NOTE = "Học phần điều kiện (giáo dục thể chất, quốc phòng và an ninh) ghi Đạt/Không đạt, không tính điểm trung bình và tín chỉ tích lũy";

export const CONDITIONAL_PASS_LABEL = "Đạt";
export const CONDITIONAL_FAIL_LABEL = "Không đạt";

export function resultMark(course: { letter: string | null; isConditional?: boolean }) {
  if (!course.isConditional || course.letter === null) return course.letter ?? "";
  return course.letter === "F" ? CONDITIONAL_FAIL_LABEL : CONDITIONAL_PASS_LABEL;
}

export function resultPoint4(course: { point4: number | null; isConditional?: boolean }) {
  return course.isConditional ? null : course.point4;
}


export function creditAverage(courses: Pick<TranscriptCourseInput, "credits" | "point4" | "score10">[], key: "point4" | "score10") {
  const graded = courses.filter((course) => course[key] !== null);
  const credits = graded.reduce((sum, course) => sum + course.credits, 0);
  if (credits === 0) return null;
  const total = graded.reduce((sum, course) => sum + Math.round((course[key] as number) * 100) * course.credits, 0);
  return Math.floor((2 * total + credits) / (2 * credits)) / 100;
}

export function latestAttempts<T extends { courseCode: string; point4: number | null; letter?: string | null }>(attempts: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const attempt of attempts) if (hasResult({ letter: attempt.letter ?? null, point4: attempt.point4 })) latest.set(attempt.courseCode, attempt);
  return latest;
}

export function latestGrades(terms: { isInProgress: boolean; courses: { courseCode: string; letter: string | null }[] }[]): Record<string, string> {
  const latest: Record<string, string> = {};
  for (const term of terms) {
    if (term.isInProgress) continue;
    for (const course of term.courses) if (course.letter && course.letter !== "W" && course.letter !== "I") latest[course.courseCode] = course.letter;
  }
  return latest;
}

export function buildTranscript(terms: TranscriptTermInput[]): TranscriptTerm[] {
  const previousLetters = new Map<string, (string | null)[]>();
  const latest = new Map<string, TranscriptCourseInput & { termIndex: number }>();
  const replaced = new Set<string>();
  const rows = terms.map((term, termIndex) => {
    const courses = term.courses.map((course) => {
      const previous = previousLetters.get(course.courseCode) ?? [];
      const last = previous.at(-1);
      if (hasResult(course)) previousLetters.set(course.courseCode, [...previous, course.letter]);
      return { ...course, attempt: previous.length + 1, retakeKind: previous.length === 0 ? null : last === "F" ? ("retake" as const) : ("improve" as const) };
    });
    if (!term.isInProgress) {
      for (const course of term.courses) {
        if (!hasResult(course)) continue;
        const earlier = latest.get(course.courseCode);
        if (earlier) replaced.add(`${earlier.termIndex}:${course.courseCode}`);
        latest.set(course.courseCode, { ...course, termIndex });
      }
    }
    const graded = term.courses.filter(countsTowardAverage);
    return {
      ...term,
      courses,
      attemptedCredits: graded.filter(countsAsAttempted).reduce((sum, course) => sum + course.credits, 0),
      earnedCredits: term.isInProgress ? 0 : graded.filter(isPassing).reduce((sum, course) => sum + course.credits, 0),
      gpa4: creditAverage(graded, "point4"),
      gpa10: creditAverage(graded, "score10"),
      cpa4: term.isInProgress ? null : creditAverage([...latest.values()].filter(countsTowardAverage), "point4"),
    };
  });
  return rows.map((term, termIndex) => ({
    ...term,
    courses: term.courses.map((course): TranscriptCourse => ({ ...course, replaced: replaced.has(`${termIndex}:${course.courseCode}`) })),
  }));
}

export function attemptNote(course: Pick<TranscriptCourse, "retakeKind" | "replaced" | "letter" | "isConditional">) {
  const notes = [
    course.isConditional ? "học phần điều kiện" : null,
    course.retakeKind === "retake" ? "học lại" : course.retakeKind === "improve" ? "học cải thiện" : null,
    course.replaced ? "không tính tích lũy" : null,
    course.letter && course.letter in RESULT_MARK_NOTE ? RESULT_MARK_NOTE[course.letter as ResultMark] : null,
  ].filter(Boolean);
  return notes.length > 0 ? ` (${notes.join(", ")})` : "";
}

export function toStanding(cpa4: number, thresholds: StandingThresholds): AcademicStanding {
  if (cpa4 >= thresholds.excellent) return "excellent";
  if (cpa4 >= thresholds.veryGood) return "very-good";
  if (cpa4 >= thresholds.good) return "good";
  if (cpa4 >= thresholds.average) return "average";
  if (cpa4 >= thresholds.weak) return "weak";
  return "poor";
}

export function warningLevelOf(input: { hasCourses: boolean; cpa4: number; failedCredits: number; lastTermGpa4: number | null }, thresholds: WarningThresholds): 0 | 1 | 2 | 3 {
  if (!input.hasCourses) return 0;
  if (input.cpa4 < thresholds.level3Cpa) return 3;
  if (input.cpa4 < thresholds.level2Cpa || input.failedCredits >= thresholds.level2FailedCredits) return 2;
  if ((input.lastTermGpa4 !== null && input.lastTermGpa4 < thresholds.level1TermGpa) || input.failedCredits >= thresholds.level1FailedCredits) return 1;
  return 0;
}

export function computeStanding(studentId: string, transcript: TranscriptTerm[], rules: StandingRules): StudentStanding {
  const completed = transcript.filter((term) => !term.isInProgress);
  const attempts = completed.flatMap((term) => term.courses.filter((course) => hasResult(course) && countsTowardAverage(course)));
  const latest = attempts.filter((course) => !course.replaced);
  const cpa4 = creditAverage(latest, "point4");
  const cpa10 = creditAverage(latest, "score10");
  const failedCredits = latest.filter((course) => course.letter === "F").reduce((sum, course) => sum + course.credits, 0);
  const lastTerm = completed.filter((term) => term.courses.some((course) => course.point4 !== null && countsTowardAverage(course))).at(-1);
  const lastTermGpa4 = lastTerm?.gpa4 ?? null;
  return {
    studentId,
    cpa4,
    cpa10,
    earnedCredits: latest.filter(isPassing).reduce((sum, course) => sum + course.credits, 0),
    failedCredits,
    retakeCredits: attempts.filter((course) => course.letter === "F").reduce((sum, course) => sum + course.credits, 0),
    lastTermGpa4,
    standing: cpa4 === null ? null : toStanding(cpa4, rules.standing),
    warningLevel: cpa4 === null ? 0 : warningLevelOf({ hasCourses: true, cpa4, failedCredits, lastTermGpa4 }, rules.warning),
  };
}

export function warningReasons(standing: Pick<StudentStanding, "cpa4" | "lastTermGpa4" | "failedCredits">, thresholds: WarningThresholds) {
  const reasons: string[] = [];
  const cpa4 = standing.cpa4 ?? 0;
  if (cpa4 < thresholds.level3Cpa) reasons.push(`CPA ${formatPoint(cpa4)} dưới ngưỡng ${formatPoint(thresholds.level3Cpa, 1)}`);
  else if (cpa4 < thresholds.level2Cpa) reasons.push(`CPA ${formatPoint(cpa4)} dưới ngưỡng ${formatPoint(thresholds.level2Cpa, 1)}`);
  if (standing.lastTermGpa4 !== null && standing.lastTermGpa4 < thresholds.level1TermGpa) {
    reasons.push(`ĐTB học kỳ gần nhất ${formatPoint(standing.lastTermGpa4)} dưới ngưỡng ${formatPoint(thresholds.level1TermGpa, 1)}`);
  }
  if (standing.failedCredits >= thresholds.level1FailedCredits) {
    const limit = standing.failedCredits >= thresholds.level2FailedCredits ? thresholds.level2FailedCredits : thresholds.level1FailedCredits;
    reasons.push(`Nợ ${standing.failedCredits} tín chỉ (từ ${limit} tín chỉ)`);
  }
  return reasons;
}

export function warningRules(thresholds: WarningThresholds) {
  return [
    `Mức 1: ĐTB học kỳ dưới ${formatPoint(thresholds.level1TermGpa, 1)} hoặc nợ từ ${thresholds.level1FailedCredits} tín chỉ trở lên`,
    `Mức 2: CPA dưới ${formatPoint(thresholds.level2Cpa, 1)} hoặc nợ từ ${thresholds.level2FailedCredits} tín chỉ trở lên`,
    `Mức 3: CPA dưới ${formatPoint(thresholds.level3Cpa, 1)}`,
    `Bị cảnh báo ${thresholds.expelAfterWarnings} học kỳ chính liên tiếp hoặc ở mức 3: Phòng Đào tạo xem xét buộc thôi học`,
  ];
}

export function summarizeStandings(entries: { faculty: string; standing: Pick<StudentStanding, "cpa4" | "standing">; warned: boolean }[]): FacultyStandingSummary[] {
  const summary = new Map<string, FacultyStandingSummary & { cpaTotal: number }>();
  for (const { faculty, standing, warned } of entries) {
    const entry =
      summary.get(faculty) ??
      ({
        faculty,
        total: 0,
        unranked: 0,
        averageCpa: 0,
        cpaTotal: 0,
        warnings: 0,
        counts: Object.fromEntries(STANDINGS.map((step) => [step.standing, 0])) as Record<AcademicStanding, number>,
      } satisfies FacultyStandingSummary & { cpaTotal: number });
    if (warned) entry.warnings += 1;
    if (standing.standing === null || standing.cpa4 === null) entry.unranked += 1;
    else {
      entry.total += 1;
      entry.cpaTotal += Math.round(standing.cpa4 * 100);
      entry.counts[standing.standing] += 1;
    }
    summary.set(faculty, entry);
  }
  return [...summary.values()].map(({ cpaTotal, ...entry }) => ({ ...entry, averageCpa: entry.total > 0 ? Math.round(cpaTotal / entry.total) / 100 : 0 }));
}


export function gradeEntryDeadline(input: { finalExamDate: string | null; termEnd: string }, gradeEntryDays: number) {
  return schoolTime(input.finalExamDate ?? input.termEnd)
    .add(gradeEntryDays, "day")
    .hour(23)
    .minute(59)
    .second(0)
    .millisecond(0)
    .toISOString();
}

export function sheetState(status: GradeSheetStatus, deadline: string, dueSoonDays: number, now = dayjs()): GradeSheetState {
  if (status === "published" || status === "approved" || status === "locked" || status === "returned") return status;
  if (now.isAfter(deadline)) return "overdue";
  if (schoolTime(deadline).startOf("day").diff(schoolTime(now).startOf("day"), "day") <= dueSoonDays) return "due-soon";
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

export const NEXT_WARNING_STATUS: Partial<Record<WarningStatus, WarningStatus>> = { new: "notified", notified: "resolved" };

const score = z
  .number("Điểm phải là số")
  .min(0, "Điểm từ 0 đến 10")
  .max(10, "Điểm từ 0 đến 10")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "Điểm lấy tối đa 2 chữ số thập phân");

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

export const GRADE_IMPORT_MAX_BYTES = 900 * 1024;

export function academicWarningOf(standing: StudentStanding, thresholds: WarningThresholds) {
  if (standing.warningLevel === 0 || standing.cpa4 === null) return null;
  return {
    level: standing.warningLevel,
    termGpa4: standing.lastTermGpa4 ?? 0,
    cpa4: standing.cpa4,
    failedCredits: standing.failedCredits,
    reasons: warningReasons(standing, thresholds),
  };
}

export function consecutiveWarnings(mainTermIds: string[], warnedTermIds: Set<string>) {
  let count = 0;
  for (let index = mainTermIds.length - 1; index >= 0 && warnedTermIds.has(mainTermIds[index]); index -= 1) count += 1;
  return count;
}

export function expulsionReasons(input: { consecutive: number; level: number }, thresholds: WarningThresholds) {
  const reasons: string[] = [];
  if (input.consecutive >= thresholds.expelAfterWarnings) reasons.push(`Bị cảnh báo ${input.consecutive} học kỳ chính liên tiếp (quy chế: ${thresholds.expelAfterWarnings})`);
  if (input.level === 3) reasons.push(`Cảnh báo mức 3: CPA dưới ${formatPoint(thresholds.level3Cpa, 1)}`);
  return reasons;
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

export function isWarningTerm(term: { semester: number; endDate: string }, today: string) {
  return term.semester !== 3 && term.endDate < today;
}

export function latestWarningTerm<T extends { semester: number; endDate: string }>(terms: T[], today: string): T | null {
  return terms.filter((term) => isWarningTerm(term, today)).toSorted((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
}

export const ACADEMIC_WARNING_GENERATE_SCHEMA = z.object({ termId: z.uuid("Chọn học kỳ") });


export function resultText(result: { score10: number | null; letter: string | null } | null | undefined) {
  if (!result?.letter) return "Chưa có";
  if (result.score10 === null) return result.letter in RESULT_MARK_NOTE ? `${result.letter} (${RESULT_MARK_NOTE[result.letter as ResultMark]})` : result.letter;
  return `${formatPoint(result.score10, 1)} (${result.letter})`;
}

export function withdrawDeadline(termStart: string, weeks: number) {
  return dayjs(termStart)
    .add(weeks * 7 - 1, "day")
    .format("YYYY-MM-DD");
}

export function withdrawBlockedReason(input: { termStart: string; termEnd: string; sheetStatus: string | null }, today: string, weeks: number) {
  if (input.sheetStatus === "published") return "Lớp đã công bố điểm, không rút học phần được nữa.";
  if (today > input.termEnd) return "Học kỳ đã kết thúc, không rút học phần được nữa.";
  const deadline = withdrawDeadline(input.termStart, weeks);
  if (today > deadline) return `Đã quá hạn rút học phần: quy chế cho rút trong ${weeks} tuần đầu học kỳ (đến hết ngày ${dayjs(deadline).format("DD/MM/YYYY")}).`;
  return null;
}

export function overdueIncompletes<T extends { termId: string }>(results: T[], terms: { id: string; startDate: string; endDate: string }[], incompleteTerms: number, today: string) {
  const ordered = terms.toSorted((a, b) => a.startDate.localeCompare(b.startDate));
  const position = new Map(ordered.map((term, index) => [term.id, index]));
  return results.filter((result) => {
    const index = position.get(result.termId);
    if (index === undefined) return false;
    const deadlineTerm = ordered[index + incompleteTerms];
    return deadlineTerm !== undefined && deadlineTerm.endDate < today;
  });
}

export function gradeChangeTarget(details: { label: string; value: string }[]) {
  const value = (label: string) => details.find((detail) => detail.label === label)?.value ?? null;
  const student = value("Sinh viên");
  const component = value("Cột điểm");
  const proposed = value("Điểm mới");
  const code = student?.split(",").at(-1)?.replace(/\D/g, "") ?? "";
  const proposedScore = proposed === null ? Number.NaN : Number(proposed.replace(",", "."));
  if (!component || code.length !== 10) return null;
  return { studentCode: code, componentLabel: component, newScore: Number.isFinite(proposedScore) ? proposedScore : null };
}

const amendmentScore = z
  .number("Chưa nhập điểm mới")
  .min(0, "Điểm từ 0 đến 10")
  .max(10, "Điểm từ 0 đến 10")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "Điểm lấy tối đa 2 chữ số thập phân");

const amendmentReason = z.string("Chưa nhập lý do").trim().min(1, "Ghi lý do sửa điểm").max(500, "Tối đa 500 ký tự");

export const GRADE_AMENDMENT_PROPOSE_SCHEMA = z.object({
  classSectionId: z.uuid("Chưa chọn lớp"),
  studentId: z.uuid("Chưa chọn sinh viên"),
  componentKey: z.string("Chưa chọn cột điểm").trim().min(1, "Chưa chọn cột điểm").max(40),
  newScore: amendmentScore,
  reason: amendmentReason,
});

export type GradeAmendmentProposeInput = z.input<typeof GRADE_AMENDMENT_PROPOSE_SCHEMA>;

export const GRADE_AMENDMENT_DECIDE_SCHEMA = z
  .object({
    id: z.uuid(),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500, "Tối đa 500 ký tự").default(""),
  })
  .refine((input) => input.decision === "approved" || input.note.length > 0, { path: ["note"], message: "Ghi lý do từ chối để người đề nghị biết" });

export type GradeAmendmentDecideInput = z.input<typeof GRADE_AMENDMENT_DECIDE_SCHEMA>;

export const REGRADE_EFFECT_SCHEMA = z.object({ newScore: amendmentScore }, "Nhập điểm sau phúc khảo trước khi duyệt");

export const GRADE_CHANGE_EFFECT_SCHEMA = z.object({ newScore: amendmentScore.optional() }).default({});

export const EXAM_POSTPONE_EFFECT_SCHEMA = z.object({ examKind: z.enum(["midterm", "final"]).optional() }).default({});

export const CREDIT_TRANSFER_EFFECT_SCHEMA = z.object(
  {
    courses: z
      .array(
        z
          .object({
            courseId: z.uuid("Chưa chọn học phần"),
            mode: z.enum(["transfer", "exemption"], "Chọn công nhận điểm hoặc miễn"),
            score10: amendmentScore.nullable().optional(),
          })
          .refine((course) => course.mode === "exemption" || (course.score10 ?? null) !== null, { path: ["score10"], message: "Nhập điểm được công nhận" }),
      )
      .min(1, "Thêm ít nhất một học phần được công nhận hoặc miễn")
      .max(30, "Tối đa 30 học phần mỗi đơn")
      .refine((courses) => new Set(courses.map((course) => course.courseId)).size === courses.length, "Một học phần chỉ ghi một lần"),
  },
  "Nhập các học phần được công nhận hoặc miễn trước khi duyệt",
);

export type CreditTransferEffect = z.output<typeof CREDIT_TRANSFER_EFFECT_SCHEMA>;
