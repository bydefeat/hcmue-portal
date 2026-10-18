import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { overlaps } from "./course-registration.constant";
import type { ClassSectionView, StudentEnrollment } from "./course-registration.type";

export type RegistrationIssueKind = "full" | "prerequisite" | "conflict" | "duplicate" | "credits" | "passed" | "cancelled" | "in-progress";

export type RegistrationIssue = {
  kind: RegistrationIssueKind;
  blocking: boolean;
  message: string;
};

export type EligibilityContext = {
  planned: ClassSectionView[];
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  courseNames: Record<string, string>;
  maxCredits: number;
  inProgressCodes?: string[];
};

export const IMPROVABLE_GRADES = ["B", "C+", "C", "D+", "D"];

export function sectionCredits(sections: { credits: number }[]) {
  return sections.reduce((sum, section) => sum + section.credits, 0);
}

export function evaluateSection(section: ClassSectionView, context: EligibilityContext): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  const others = context.planned.filter((entry) => entry.id !== section.id);

  if (section.status === "cancelled") {
    issues.push({ kind: "cancelled", blocking: true, message: `Lớp ${section.code} đã bị hủy. Chọn lớp khác cùng học phần.` });
  }

  const sameCourse = others.find((entry) => entry.courseCode === section.courseCode);
  if (sameCourse) {
    issues.push({
      kind: "duplicate",
      blocking: true,
      message: `Đã chọn lớp ${sameCourse.code} của cùng học phần. Bỏ lớp đó trước nếu muốn đổi lớp.`,
    });
  }

  if (section.enrolled >= section.capacity) {
    issues.push({
      kind: "full",
      blocking: true,
      message: `Lớp ${section.code} đã đủ ${section.enrolled}/${section.capacity} chỗ. Chọn lớp khác cùng học phần hoặc gửi đơn xin mở lớp.`,
    });
  }

  const missing = (context.prerequisites[section.courseCode] ?? []).filter((code) => {
    const letter = context.passedGrades[code];
    return !letter || letter === "F";
  });
  if (missing.length > 0) {
    const names = missing.map((code) => `${code} ${context.courseNames[code] ?? ""}`.trim()).join(", ");
    issues.push({
      kind: "prerequisite",
      blocking: true,
      message: `Chưa đạt học phần tiên quyết ${names}. Học và đạt học phần này trước.`,
    });
  }

  for (const other of others) {
    const clash = other.meetings.find((theirs) => section.meetings.some((mine) => overlaps(mine, theirs)));
    if (!clash) continue;
    issues.push({
      kind: "conflict",
      blocking: true,
      message: `Trùng lịch với ${other.code} (${weekdayLabel(clash.dayOfWeek)}, ${periodLabel(clash.startPeriod, clash.endPeriod)}). Bỏ một trong hai lớp.`,
    });
    break;
  }

  const isPlanned = context.planned.some((entry) => entry.id === section.id);
  const currentCredits = sectionCredits(others);
  if (!isPlanned && currentCredits + section.credits > context.maxCredits) {
    issues.push({
      kind: "credits",
      blocking: true,
      message: `Vượt hạn mức ${context.maxCredits} tín chỉ (đang có ${currentCredits}). Bỏ bớt học phần hoặc gửi đơn học vượt tín chỉ.`,
    });
  }

  if (context.inProgressCodes?.includes(section.courseCode)) {
    issues.push({
      kind: "in-progress",
      blocking: true,
      message: `Bạn đang học ${section.courseCode} ở học kỳ này. Chờ có điểm, nếu chưa đạt thì đăng ký học lại ở đợt sau.`,
    });
  }

  const passed = context.passedGrades[section.courseCode];
  if (passed && passed !== "F") {
    issues.push({
      kind: "passed",
      blocking: !IMPROVABLE_GRADES.includes(passed),
      message: IMPROVABLE_GRADES.includes(passed)
        ? `Đã đạt điểm ${passed}. Đăng ký lại được tính là học cải thiện điểm.`
        : `Đã đạt điểm ${passed}, không cần học lại.`,
    });
  }

  return issues;
}

export function pickTimetable(
  enrollments: StudentEnrollment[],
  passedGrades: Record<string, string>,
  options: { faculty?: string; prerequisites?: Record<string, string[]>; maxSections?: number } = {},
) {
  const { faculty, prerequisites = {}, maxSections = 5 } = options;
  const chosen: StudentEnrollment[] = [];
  const rank = (enrollment: StudentEnrollment) =>
    (enrollment.section.faculty === faculty ? 0 : 2) + (passedGrades[enrollment.section.courseCode] ? 1 : 0);
  const ordered = [...enrollments].sort((a, b) => rank(a) - rank(b) || a.section.code.localeCompare(b.section.code));
  for (const enrollment of ordered) {
    if (chosen.length >= maxSections) break;
    const { section } = enrollment;
    const grade = passedGrades[section.courseCode];
    if (grade && grade !== "F" && !IMPROVABLE_GRADES.includes(grade)) continue;
    if ((prerequisites[section.courseCode] ?? []).some((code) => !passedGrades[code] || passedGrades[code] === "F")) continue;
    if (chosen.some((entry) => entry.section.courseCode === section.courseCode)) continue;
    if (chosen.some((entry) => entry.section.meetings.some((theirs) => section.meetings.some((mine) => overlaps(mine, theirs))))) continue;
    chosen.push(enrollment);
  }
  return chosen;
}

const LETTER_ORDER = ["A", "B+", "B", "C+", "C", "D+", "D", "F"];

export function bestGrades(terms: { isInProgress: boolean; courses: { courseCode: string; letter: string | null }[] }[]) {
  const best: Record<string, string> = {};
  for (const term of terms) {
    if (term.isInProgress) continue;
    for (const course of term.courses) {
      if (!course.letter) continue;
      const current = best[course.courseCode];
      if (!current || LETTER_ORDER.indexOf(course.letter) < LETTER_ORDER.indexOf(current)) best[course.courseCode] = course.letter;
    }
  }
  return best;
}
