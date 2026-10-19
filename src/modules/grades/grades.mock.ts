import { createRandom, mockDate, mockSectionId, mockStudentIdentity, mockTermId } from "@/shared/libs/mock.lib";
import { COURSES_IN_CURRENT_TERM, COURSES_PER_PAST_TERM, mockCourseSequence, TERMS_DONE_BY_COHORT } from "@/shared/libs/mock-course.lib";
import { toLetter } from "@/modules/grades/grades.constant";
import type { GradeComponent, GradeSheetStatus, TranscriptCourse } from "@/modules/grades/grades.type";

export const PAST_TERMS = [
  { id: mockTermId("hk1-2022"), name: "Học kỳ 1, năm học 2022-2023" },
  { id: mockTermId("hk2-2022"), name: "Học kỳ 2, năm học 2022-2023" },
  { id: mockTermId("hk1-2023"), name: "Học kỳ 1, năm học 2023-2024" },
  { id: mockTermId("hk2-2023"), name: "Học kỳ 2, năm học 2023-2024" },
  { id: mockTermId("hk1-2024"), name: "Học kỳ 1, năm học 2024-2025" },
  { id: mockTermId("hk2-2024"), name: "Học kỳ 2, năm học 2024-2025" },
  { id: mockTermId("hk1-2025"), name: "Học kỳ 1, năm học 2025-2026" },
  { id: mockTermId("hk2-2025"), name: "Học kỳ 2, năm học 2025-2026" },
];

export const CURRENT_TERM = { id: mockTermId("hk1-2026"), name: "Học kỳ 1, năm học 2026-2027" };


function clamp(value: number) {
  return Math.min(10, Math.max(0, Math.round(value * 10) / 10));
}

export function abilityOf(index: number) {
  const random = createRandom(index * 97 + 3);
  if (index % 23 === 5) return 3.9 + random();
  if (index % 37 === 11) return 4.4 + random();
  return 5.8 + random() * 3.4;
}

export function mockTranscriptTerms(index: number) {
  const student = mockStudentIdentity(index);
  const termsDone = TERMS_DONE_BY_COHORT[student.cohort] ?? 0;
  const firstTerm = PAST_TERMS.length - termsDone;
  const ability = abilityOf(index);
  const random = createRandom(index * 131 + 9);
  const ordered = mockCourseSequence(student.majorCode);

  let cursor = 0;
  const takeCourses = (count: number) => {
    const taken = ordered.slice(cursor, cursor + count);
    cursor += count;
    return taken;
  };

  const terms = PAST_TERMS.slice(firstTerm).map((term) => ({
    termId: term.id,
    termName: term.name,
    isInProgress: false,
    courses: takeCourses(COURSES_PER_PAST_TERM).map(([courseCode, courseName, credits]): TranscriptCourse => {
      const score10 = clamp(ability + (random() - 0.5) * 3);
      const scale = toLetter(score10);
      return { courseCode, courseName, credits, score10, letter: scale.letter, point4: scale.point4 };
    }),
  }));

  const current = {
    termId: CURRENT_TERM.id,
    termName: CURRENT_TERM.name,
    isInProgress: true,
    courses: takeCourses(COURSES_IN_CURRENT_TERM).map(([courseCode, courseName, credits]): TranscriptCourse => ({
      courseCode,
      courseName,
      credits,
      score10: null,
      letter: null,
      point4: null,
    })),
  };

  return student.cohort === 48 ? terms : [...terms, current];
}

export const DEFAULT_COMPONENTS: GradeComponent[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10 },
  { key: "midterm", label: "Giữa kỳ", weight: 30 },
  { key: "final", label: "Cuối kỳ", weight: 60 },
];

export const PROJECT_COMPONENTS: GradeComponent[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10 },
  { key: "project", label: "Đồ án", weight: 40 },
  { key: "final", label: "Cuối kỳ", weight: 50 },
];

const FULL = { attendance: 1, midterm: 1, final: 1 };
const FULL_PROJECT = { attendance: 1, project: 1, final: 1 };

export const GRADE_SHEET_SEEDS: Record<
  string,
  { components: GradeComponent[]; status: GradeSheetStatus; deadline: string; fill: Record<string, number> }
> = {
  [mockSectionId("hk1-2026", "COMP1020.01")]: { components: DEFAULT_COMPONENTS, status: "draft", deadline: mockDate(3, "23:59"), fill: { attendance: 1, midterm: 0.7, final: 0 } },
  [mockSectionId("hk1-2026", "COMP1020.02")]: { components: DEFAULT_COMPONENTS, status: "draft", deadline: mockDate(12, "23:59"), fill: { attendance: 1, midterm: 0.1, final: 0 } },
  [mockSectionId("hk1-2026", "COMP1070.01")]: { components: PROJECT_COMPONENTS, status: "locked", deadline: mockDate(-6, "23:59"), fill: { attendance: 1, project: 1, final: 1 } },
  [mockSectionId("hk1-2026", "COMP1080.01")]: { components: DEFAULT_COMPONENTS, status: "draft", deadline: mockDate(-1, "23:59"), fill: { attendance: 1, midterm: 0.9, final: 0 } },
  [mockSectionId("hk1-2026", "COMP1010.01")]: { components: DEFAULT_COMPONENTS, status: "approved", deadline: mockDate(-5, "23:59"), fill: FULL },
  [mockSectionId("hk1-2026", "COMP1040.01")]: { components: DEFAULT_COMPONENTS, status: "approved", deadline: mockDate(-4, "23:59"), fill: FULL },
  [mockSectionId("hk1-2026", "COMP1031.01")]: { components: PROJECT_COMPONENTS, status: "locked", deadline: mockDate(-2, "23:59"), fill: FULL_PROJECT },
  [mockSectionId("hk1-2026", "MATH1011.01")]: { components: DEFAULT_COMPONENTS, status: "published", deadline: mockDate(-12, "23:59"), fill: FULL },
  [mockSectionId("hk1-2026", "LITR1010.01")]: { components: DEFAULT_COMPONENTS, status: "locked", deadline: mockDate(-1, "23:59"), fill: FULL },
  [mockSectionId("hk1-2026", "PSYC1001.01")]: { components: DEFAULT_COMPONENTS, status: "returned", deadline: mockDate(2, "23:59"), fill: FULL },
  [mockSectionId("hk1-2026", "ENGL1002.01")]: { components: DEFAULT_COMPONENTS, status: "draft", deadline: mockDate(-3, "23:59"), fill: { attendance: 1, midterm: 0.5, final: 0 } },
};
