import { daysUntil, dayjs } from "@/shared/libs/date.lib";
import { createRandom, mockDate, mockStudentIdentity } from "@/shared/libs/mock.lib";
import { mockDelay } from "@/shared/libs/mock-request.lib";
import { DUE_SOON_DAYS, STANDING_SCALE, toStanding } from "@/modules/grades/grades.constant";
import { abilityOf, DEFAULT_COMPONENTS, GRADE_SHEET_SEEDS, mockTranscriptTerms } from "@/modules/grades/grades.mock";
import type {
  AcademicStanding,
  AcademicWarning,
  FacultyStandingSummary,
  GradeSheet,
  GradeSheetState,
  GradeSheetSummary,
  StudentStanding,
  TranscriptCourse,
  TranscriptTerm,
} from "@/modules/grades/grades.type";

const STUDENT_TOTAL = 600;

function indexOf(studentId: string) {
  return Number(studentId.replace("sv-", ""));
}

function average(courses: TranscriptCourse[], key: "point4" | "score10") {
  const graded = courses.filter((course) => course[key] !== null);
  const credits = graded.reduce((sum, course) => sum + course.credits, 0);
  if (credits === 0) return null;
  return Math.round((graded.reduce((sum, course) => sum + (course[key] as number) * course.credits, 0) / credits) * 100) / 100;
}

function buildTranscript(index: number): TranscriptTerm[] {
  const accumulated: TranscriptCourse[] = [];
  return mockTranscriptTerms(index).map((term) => {
    accumulated.push(...term.courses.filter((course) => course.point4 !== null));
    const attemptedCredits = term.courses.reduce((sum, course) => sum + course.credits, 0);
    const earnedCredits = term.courses.filter((course) => (course.point4 ?? 0) > 0).reduce((sum, course) => sum + course.credits, 0);
    return {
      ...term,
      attemptedCredits,
      earnedCredits: term.isInProgress ? 0 : earnedCredits,
      gpa4: average(term.courses, "point4"),
      gpa10: average(term.courses, "score10"),
      cpa4: term.isInProgress ? null : average(accumulated, "point4"),
    };
  });
}

function standingOf(index: number): StudentStanding {
  const transcript = buildTranscript(index);
  const completed = transcript.filter((term) => !term.isInProgress);
  const courses = completed.flatMap((term) => term.courses);
  const cpa4 = average(courses, "point4") ?? 0;
  const cpa10 = average(courses, "score10") ?? 0;
  const failedCredits = courses.filter((course) => course.letter === "F").reduce((sum, course) => sum + course.credits, 0);
  const lastTerm = completed.filter((term) => term.courses.length > 0).at(-1);
  const lastTermGpa4 = lastTerm?.gpa4 ?? 0;
  const warningLevel = courses.length === 0 ? 0 : cpa4 < 1 ? 3 : cpa4 < 1.5 || failedCredits >= 12 ? 2 : (lastTerm && lastTermGpa4 < 1) || failedCredits >= 6 ? 1 : 0;
  return {
    studentId: `sv-${index}`,
    cpa4,
    cpa10,
    earnedCredits: completed.reduce((sum, term) => sum + term.earnedCredits, 0),
    failedCredits,
    lastTermGpa4,
    standing: toStanding(cpa4),
    warningLevel,
  };
}

const STANDING_CACHE = new Map<number, StudentStanding>();

function cachedStanding(index: number) {
  if (!STANDING_CACHE.has(index)) STANDING_CACHE.set(index, standingOf(index));
  return STANDING_CACHE.get(index)!;
}

export async function getTranscript(studentId: string) {
  await mockDelay();
  return buildTranscript(indexOf(studentId));
}

export async function getStudentStandings(studentIds: string[]) {
  await mockDelay();
  return studentIds.map((id) => cachedStanding(indexOf(id)));
}

function reasonsOf(standing: StudentStanding) {
  const reasons: string[] = [];
  if (standing.cpa4 < 1.5) reasons.push(`CPA ${standing.cpa4.toFixed(2).replace(".", ",")} dưới ngưỡng 1,5`);
  if (standing.lastTermGpa4 < 1) reasons.push(`ĐTB học kỳ gần nhất ${standing.lastTermGpa4.toFixed(2).replace(".", ",")}`);
  if (standing.failedCredits >= 6) reasons.push(`Nợ ${standing.failedCredits} tín chỉ`);
  return reasons;
}

export async function getAcademicWarnings(studentIds?: string[]): Promise<AcademicWarning[]> {
  await mockDelay();
  const indices = studentIds ? studentIds.map(indexOf) : Array.from({ length: STUDENT_TOTAL }, (_, index) => index);
  return indices
    .map((index) => ({ index, standing: cachedStanding(index), student: mockStudentIdentity(index) }))
    .filter(({ standing, student }) => standing.warningLevel > 0 && student.cohort !== 48)
    .map(({ index, standing, student }) => {
      const random = createRandom(index + 404);
      const roll = random();
      return {
        id: `cb-${index}`,
        studentId: student.id,
        studentCode: student.code,
        fullName: student.fullName,
        className: student.className,
        faculty: student.faculty,
        cohort: student.cohort,
        termName: "Học kỳ 2, năm học 2025-2026",
        termGpa4: standing.lastTermGpa4,
        cpa4: standing.cpa4,
        failedCredits: standing.failedCredits,
        level: standing.warningLevel as 1 | 2 | 3,
        reasons: reasonsOf(standing),
        status: roll < 0.4 ? "new" : roll < 0.75 ? "notified" : "resolved",
        createdAt: mockDate(-Math.floor(random() * 20) - 2, "09:00"),
      } satisfies AcademicWarning;
    })
    .toSorted((a, b) => b.level - a.level || a.cpa4 - b.cpa4);
}

export async function getStandingSummary(): Promise<FacultyStandingSummary[]> {
  await mockDelay();
  const summary = new Map<string, FacultyStandingSummary & { cpaTotal: number }>();
  for (let index = 0; index < STUDENT_TOTAL; index += 1) {
    const student = mockStudentIdentity(index);
    if (student.cohort === 48) continue;
    const standing = cachedStanding(index);
    const entry =
      summary.get(student.faculty) ??
      ({
        faculty: student.faculty,
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
    summary.set(student.faculty, entry);
  }
  return [...summary.values()].map(({ cpaTotal, ...entry }) => ({ ...entry, averageCpa: Math.round((cpaTotal / entry.total) * 100) / 100 }));
}

function sheetState(status: GradeSheet["status"], deadline: string): GradeSheetState {
  if (status === "published" || status === "approved" || status === "locked" || status === "returned") return status;
  if (dayjs().isAfter(deadline)) return "overdue";
  if (daysUntil(deadline) <= DUE_SOON_DAYS) return "due-soon";
  return "in-progress";
}

export async function getGradeSheet(classSectionId: string, studentIds: string[]): Promise<GradeSheet & { state: GradeSheetState }> {
  await mockDelay();
  const seed = GRADE_SHEET_SEEDS[classSectionId] ?? { components: DEFAULT_COMPONENTS, status: "draft" as const, deadline: mockDate(30, "23:59"), fill: {} };
  const scores: GradeSheet["scores"] = {};
  for (const studentId of studentIds) {
    const index = indexOf(studentId);
    const random = createRandom(index * 17 + classSectionId.length * 101);
    const ability = abilityOf(index);
    scores[studentId] = Object.fromEntries(
      seed.components.map((component) => {
        const filled = random() < (seed.fill[component.key] ?? 0);
        const base = component.key === "attendance" ? ability + 2 : ability + (random() - 0.5) * 2.4;
        return [component.key, filled ? Math.min(10, Math.max(0, Math.round(base * 4) / 4)) : null];
      }),
    );
  }
  return {
    classSectionId,
    components: seed.components,
    status: seed.status,
    deadline: seed.deadline,
    lockedAt: seed.status === "draft" ? null : mockDate(-8, "16:20"),
    savedAt: seed.status === "draft" ? mockDate(-1, "21:47") : null,
    scores,
    state: sheetState(seed.status, seed.deadline),
  };
}

export async function getGradeSheetSummaries(classes: { classSectionId: string; studentIds: string[] }[]): Promise<GradeSheetSummary[]> {
  return Promise.all(
    classes.map(async ({ classSectionId, studentIds }) => {
      const sheet = await getGradeSheet(classSectionId, studentIds);
      const values = Object.values(sheet.scores).flatMap((row) => Object.values(row));
      return {
        classSectionId,
        status: sheet.status,
        state: sheet.state,
        deadline: sheet.deadline,
        filledCells: values.filter((value) => value !== null).length,
        totalCells: values.length,
      };
    }),
  );
}
