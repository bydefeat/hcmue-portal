import { createRandom, mockDate, mockId, mockSectionId, mockStudentIdentity, mockStudentIndex, mockTermId } from "@/shared/libs/mock.lib";
import { COURSES_IN_CURRENT_TERM, COURSES_PER_PAST_TERM, mockCourseSequence, TERMS_DONE_BY_COHORT } from "@/shared/libs/mock-course.lib";
import { DEFAULT_COMPONENTS } from "@/modules/grades/grades.constant";
import { letterOf } from "@/modules/grades/grades.rule";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";
import type { GradeComponent, GradeSheetStatus, ScoreRow, TranscriptCourseInput, WarningStatus } from "@/modules/grades/grades.type";

// Dữ liệu mẫu chỉ còn seed dùng (scripts/seed/grades.seed.ts); query đọc từ Postgres.

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

function abilityOf(index: number) {
  const random = createRandom(index * 97 + 3);
  if (index % 23 === 5) return 3.9 + random();
  if (index % 37 === 11) return 4.4 + random();
  return 5.8 + random() * 3.4;
}

const graded = (courseCode: string, courseName: string, credits: number, score10: number): TranscriptCourseInput => ({
  courseCode,
  courseName,
  credits,
  score10,
  ...letterOf(score10, REGULATION_RULES.grading.scale),
});

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
    courses: takeCourses(COURSES_PER_PAST_TERM).map(([courseCode, courseName, credits]) => graded(courseCode, courseName, credits, clamp(ability + (random() - 0.5) * 3))),
  }));

  // Học lại và học cải thiện ở học kỳ chính kế tiếp (luồng ngẫu nhiên riêng để điểm lần đầu không đổi): phần lớn học phần F được học lại,
  // một số sinh viên học cải thiện một học phần điểm D. Điểm tính CPA là lần học cuối.
  const retakeRandom = createRandom(index * 211 + 17);
  let improved = index % 7 !== 3;
  terms.forEach((term, position) => {
    const next = terms[position + 1];
    if (!next) return;
    for (const course of term.courses) {
      const isFailed = course.letter === "F";
      const improve = !improved && (course.letter === "D" || course.letter === "D+");
      if (!(isFailed && retakeRandom() < 0.75) && !improve) continue;
      if (improve) improved = true;
      next.courses.push(graded(course.courseCode, course.courseName, course.credits, clamp(Math.max(ability, 5) + retakeRandom() * 2)));
    }
  });

  const current = {
    termId: CURRENT_TERM.id,
    termName: CURRENT_TERM.name,
    isInProgress: true,
    courses: takeCourses(COURSES_IN_CURRENT_TERM).map(([courseCode, courseName, credits]): TranscriptCourseInput => ({
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

const PROJECT_COMPONENTS: GradeComponent[] = [
  { key: "attendance", label: "Chuyên cần", weight: 10 },
  { key: "project", label: "Đồ án", weight: 40 },
  { key: "final", label: "Cuối kỳ", weight: 50 },
];

const FULL = { attendance: 1, midterm: 1, final: 1 };
const FULL_PROJECT = { attendance: 1, project: 1, final: 1 };

export type GradeSheetSeed = { components: GradeComponent[]; status: GradeSheetStatus; deadline: string; fill: Record<string, number> };

export const GRADE_SHEET_SEEDS: Record<string, GradeSheetSeed> = {
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

// Lớp không có trong GRADE_SHEET_SEEDS: bảng điểm nháp, chưa nhập ô nào.
export const DEFAULT_SHEET_SEED: GradeSheetSeed = { components: DEFAULT_COMPONENTS, status: "draft", deadline: mockDate(30, "23:59"), fill: {} };

export const RETURN_REASON = "Tổng trọng số cột giữa kỳ sai, kiểm tra lại cấu hình cột điểm.";

export const SHEET_LOCKED_AT = mockDate(-8, "16:20");
export const SHEET_SAVED_AT = mockDate(-1, "21:47");

// Điểm thành phần của một sinh viên trong bảng điểm mẫu: ô nào chưa nhập thì null.
export function mockScoreRow(classSectionId: string, studentId: string, seed: GradeSheetSeed): ScoreRow {
  const index = mockStudentIndex(studentId);
  const random = createRandom(index * 17 + classSectionId.length * 101);
  const ability = abilityOf(index);
  return Object.fromEntries(
    seed.components.map((component) => {
      const filled = random() < (seed.fill[component.key] ?? 0);
      const base = component.key === "attendance" ? ability + 2 : ability + (random() - 0.5) * 2.4;
      return [component.key, filled ? Math.min(10, Math.max(0, Math.round(base * 4) / 4)) : null];
    }),
  );
}

// Cảnh báo học vụ sau học kỳ 2, năm học 2025-2026: trạng thái xử lý và ngày lập của từng sinh viên.
export const WARNING_TERM_KEY = "hk2-2025";

export function mockWarningMeta(index: number): { id: string; status: WarningStatus; createdAt: string } {
  const random = createRandom(index + 404);
  const roll = random();
  return {
    id: mockId(`warning:${WARNING_TERM_KEY}:${index}`),
    status: roll < 0.4 ? "new" : roll < 0.75 ? "notified" : "resolved",
    createdAt: mockDate(-Math.floor(random() * 20) - 2, "09:00"),
  };
}
