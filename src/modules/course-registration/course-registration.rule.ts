import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs } from "@/shared/libs/date.lib";
import { audienceText, overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassMeeting, ClassSectionView, RegistrationEvent, RegistrationHold, StudentEnrollment } from "@/modules/course-registration/course-registration.type";

export type RegistrationIssueKind =
  | "hold"
  | "full"
  | "reserved"
  | "audience"
  | "prerequisite"
  | "corequisite"
  | "conflict"
  | "lab"
  | "duplicate"
  | "credits"
  | "passed"
  | "cancelled"
  | "in-progress";

export type RegistrationIssue = {
  kind: RegistrationIssueKind;
  blocking: boolean;
  message: string;
};

export type RegistrationStudent = {
  majorCode: string;
  cohort: number;
};

export type EligibilityContext = {
  planned: ClassSectionView[];
  passedGrades: Record<string, string>;
  prerequisites: Record<string, string[]>;
  corequisites?: Record<string, string[]>;
  equivalents?: Record<string, string[]>;
  courseNames: Record<string, string>;
  maxCredits: number;
  creditCapNote?: string;
  inProgressCodes?: string[];
  student?: RegistrationStudent;
  labChoices?: Record<string, string>;
};

export const IMPROVABLE_GRADES = ["B", "C+", "C", "D+", "D"];

export function sectionCredits(sections: { credits: number }[]) {
  return sections.reduce((sum, section) => sum + section.credits, 0);
}

export function chosenMeetings(section: ClassSectionView, labChoices: Record<string, string> = {}): ClassMeeting[] {
  const lab = section.labGroups.find((group) => group.id === labChoices[section.id]);
  return lab ? [...section.meetings, lab.meeting] : section.meetings;
}

function gradeWithEquivalents(code: string, context: EligibilityContext) {
  const own = context.passedGrades[code];
  if (own && own !== "F") return { letter: own, viaCode: code };
  for (const equivalent of context.equivalents?.[code] ?? []) {
    const letter = context.passedGrades[equivalent];
    if (letter && letter !== "F") return { letter, viaCode: equivalent };
  }
  return null;
}

function courseLabel(code: string, context: EligibilityContext) {
  return `${code} ${context.courseNames[code] ?? ""}`.trim();
}

export function seatsAvailableFor(section: ClassSectionView, student?: RegistrationStudent) {
  const free = section.capacity - section.enrolled;
  const heldForOthers = section.reservedSeats
    .filter((seat) => {
      if (!student) return true;
      const majorOk = seat.majorCodes.length === 0 || seat.majorCodes.includes(student.majorCode);
      const cohortOk = seat.cohorts.length === 0 || seat.cohorts.includes(student.cohort);
      return !(majorOk && cohortOk);
    })
    .reduce((sum, seat) => sum + Math.max(0, seat.seats - seat.taken), 0);
  return Math.max(0, free - heldForOthers);
}

export function evaluateSection(section: ClassSectionView, context: EligibilityContext): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  const others = context.planned.filter((entry) => entry.id !== section.id);
  const isPlanned = context.planned.some((entry) => entry.id === section.id);
  const labChoices = context.labChoices ?? {};

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

  if (context.student && section.audience) {
    const { majorCodes, cohorts } = section.audience;
    const majorOk = majorCodes.length === 0 || majorCodes.includes(context.student.majorCode);
    const cohortOk = cohorts.length === 0 || cohorts.includes(context.student.cohort);
    if (!majorOk || !cohortOk) {
      issues.push({
        kind: "audience",
        blocking: true,
        message: `${audienceText(section.audience)}. ${section.audience.note ? `${section.audience.note}. ` : ""}Chọn lớp khác cùng học phần.`,
      });
    }
  }

  if (!isPlanned) {
    if (section.enrolled >= section.capacity) {
      issues.push({
        kind: "full",
        blocking: true,
        message: `Lớp ${section.code} đã đủ ${section.enrolled}/${section.capacity} chỗ. Vào danh sách chờ, chọn lớp khác cùng học phần hoặc gửi đơn xin mở lớp.`,
      });
    } else if (seatsAvailableFor(section, context.student) === 0) {
      const labels = section.reservedSeats.map((seat) => seat.label.toLowerCase()).join(", ");
      issues.push({
        kind: "reserved",
        blocking: true,
        message: `Còn ${section.capacity - section.enrolled} chỗ nhưng đều dành riêng cho ${labels}. Vào danh sách chờ hoặc chọn lớp khác.`,
      });
    }
  }

  if (section.labGroups.length > 0) {
    const open = section.labGroups.filter((group) => group.enrolled < group.capacity);
    const chosen = section.labGroups.find((group) => group.id === labChoices[section.id]);
    if (open.length === 0 && !chosen) {
      issues.push({
        kind: "lab",
        blocking: true,
        message: `Mọi nhóm thực hành của ${section.code} đã đủ chỗ. Chọn lớp lý thuyết khác có nhóm thực hành còn chỗ.`,
      });
    } else if (!isPlanned) {
      issues.push({
        kind: "lab",
        blocking: false,
        message: `Lớp có ${section.labGroups.length} nhóm thực hành, chọn 1 nhóm khi chọn lớp (còn ${open.length} nhóm có chỗ).`,
      });
    }
  }

  const missing = (context.prerequisites[section.courseCode] ?? []).filter((code) => !gradeWithEquivalents(code, context));
  if (missing.length > 0) {
    issues.push({
      kind: "prerequisite",
      blocking: true,
      message: `Chưa đạt học phần tiên quyết ${missing.map((code) => courseLabel(code, context)).join(", ")}. Học và đạt học phần này trước.`,
    });
  }

  const coMissing = (context.corequisites?.[section.courseCode] ?? []).filter(
    (code) => !gradeWithEquivalents(code, context) && !context.planned.some((entry) => entry.courseCode === code),
  );
  if (coMissing.length > 0) {
    issues.push({
      kind: "corequisite",
      blocking: true,
      message: `Học phần song hành ${coMissing.map((code) => courseLabel(code, context)).join(", ")} phải học cùng học kỳ. Chọn lớp của học phần đó trước.`,
    });
  }

  const mine = isPlanned ? chosenMeetings(section, labChoices) : section.meetings;
  for (const other of others) {
    const clash = chosenMeetings(other, labChoices).find((theirs) => mine.some((meeting) => overlaps(meeting, theirs)));
    if (!clash) continue;
    issues.push({
      kind: "conflict",
      blocking: true,
      message: `Trùng lịch với ${other.code} (${weekdayLabel(clash.dayOfWeek)}, ${periodLabel(clash.startPeriod, clash.endPeriod)}). Bỏ một trong hai lớp.`,
    });
    break;
  }

  const currentCredits = sectionCredits(others);
  if (!isPlanned && currentCredits + section.credits > context.maxCredits) {
    issues.push({
      kind: "credits",
      blocking: true,
      message: context.creditCapNote
        ? `${context.creditCapNote} Đang có ${currentCredits} tín chỉ, thêm lớp này sẽ vượt ${context.maxCredits}.`
        : `Vượt hạn mức ${context.maxCredits} tín chỉ (đang có ${currentCredits}). Bỏ bớt học phần hoặc gửi đơn học vượt tín chỉ.`,
    });
  }

  if (context.inProgressCodes?.includes(section.courseCode)) {
    issues.push({
      kind: "in-progress",
      blocking: true,
      message: `Bạn đang học ${section.courseCode} ở học kỳ này. Chờ có điểm, nếu chưa đạt thì đăng ký học lại ở đợt sau.`,
    });
  }

  const passed = gradeWithEquivalents(section.courseCode, context);
  if (passed) {
    const via = passed.viaCode !== section.courseCode ? ` qua học phần tương đương ${passed.viaCode}` : "";
    issues.push({
      kind: "passed",
      blocking: !IMPROVABLE_GRADES.includes(passed.letter),
      message: IMPROVABLE_GRADES.includes(passed.letter)
        ? `Đã đạt điểm ${passed.letter}${via}. Đăng ký lại được tính là học cải thiện điểm.`
        : `Đã đạt điểm ${passed.letter}${via}, không cần học lại.`,
    });
  }

  return issues;
}

export function basketProblems(basket: ClassSectionView[], context: Omit<EligibilityContext, "planned">) {
  return basket.flatMap((section) => {
    const issues = evaluateSection(section, { ...context, planned: basket }).filter(
      (issue) => issue.blocking && ["corequisite", "conflict", "duplicate", "audience"].includes(issue.kind),
    );
    const needsLab = section.labGroups.length > 0 && !context.labChoices?.[section.id];
    return [
      ...issues.map((issue) => ({ section, issue })),
      ...(needsLab
        ? [{ section, issue: { kind: "lab" as const, blocking: true, message: `Chưa chọn nhóm thực hành cho ${section.code}.` } }]
        : []),
    ];
  });
}

export function creditCapOf(
  regulation: { maxPerTerm: number; maxWhenWarned: number },
  warningLevel: number,
): { max: number; note?: string } {
  if (warningLevel > 0) {
    return {
      max: regulation.maxWhenWarned,
      note: `Sinh viên bị cảnh báo học vụ mức ${warningLevel} chỉ được đăng ký tối đa ${regulation.maxWhenWarned} tín chỉ.`,
    };
  }
  return { max: regulation.maxPerTerm };
}

export function blockingHolds(holds: RegistrationHold[]) {
  return holds.filter((hold) => hold.blocking && !hold.releasedAt);
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
  const ordered = [...enrollments].toSorted((a, b) => rank(a) - rank(b) || a.section.code.localeCompare(b.section.code));
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

export function buildRegistrationHistory(
  timetable: StudentEnrollment[],
  allEnrollments: StudentEnrollment[],
  periodOpensAt: string,
  studentName: string,
): RegistrationEvent[] {
  if (timetable.length === 0) return [];
  const start = dayjs(periodOpensAt);
  const events: RegistrationEvent[] = [];
  const self = { actor: studentName, channel: "Cổng sinh viên" };
  timetable.forEach(({ section }, index) => {
    events.push({
      id: `ev-add-${section.id}`,
      at: start.add(index * 4 + 1, "minute").toISOString(),
      kind: "add",
      sectionCode: section.code,
      courseName: section.courseName,
      ...self,
      note: `Đăng ký ${section.credits} tín chỉ`,
    });
  });
  const extra = allEnrollments.filter((entry) => !timetable.some((chosen) => chosen.section.id === entry.section.id));
  const dropped = extra[0];
  if (dropped) {
    events.push({
      id: `ev-add-${dropped.section.id}`,
      at: start.add(30, "minute").toISOString(),
      kind: "add",
      sectionCode: dropped.section.code,
      courseName: dropped.section.courseName,
      ...self,
      note: `Đăng ký ${dropped.section.credits} tín chỉ`,
    });
    events.push({
      id: `ev-drop-${dropped.section.id}`,
      at: start.add(2, "day").hour(21).toISOString(),
      kind: "drop",
      sectionCode: dropped.section.code,
      courseName: dropped.section.courseName,
      ...self,
      note: "Tự hủy trong thời gian đăng ký, hoàn trả chỗ cho sinh viên khác",
    });
  }
  const swapped = timetable[1];
  if (swapped) {
    const previousCode = `${swapped.section.courseCode}.0${Number(swapped.section.code.split(".").at(-1)) === 1 ? 2 : 1}`;
    events.push({
      id: `ev-swap-${swapped.section.id}`,
      at: start.add(1, "day").hour(8).minute(12).toISOString(),
      kind: "swap",
      sectionCode: swapped.section.code,
      courseName: swapped.section.courseName,
      ...self,
      note: `Đổi từ lớp ${previousCode} sang ${swapped.section.code} để tránh trùng lịch`,
    });
  }
  const waitlisted = timetable[2];
  if (waitlisted) {
    events.push({
      id: `ev-wait-${waitlisted.section.id}`,
      at: start.add(3, "minute").toISOString(),
      kind: "waitlist",
      sectionCode: waitlisted.section.code,
      courseName: waitlisted.section.courseName,
      ...self,
      note: "Lớp đủ chỗ, vào danh sách chờ ở vị trí 4",
    });
    events.push({
      id: `ev-promote-${waitlisted.section.id}`,
      at: start.add(3, "day").hour(10).toISOString(),
      kind: "waitlist-promoted",
      sectionCode: waitlisted.section.code,
      courseName: waitlisted.section.courseName,
      actor: "Hệ thống",
      channel: "Tự động",
      note: "Có sinh viên hủy lớp, hệ thống tự đăng ký từ danh sách chờ và gửi email",
    });
  }
  events.push({
    id: "ev-cancelled",
    at: start.add(9, "day").hour(16).toISOString(),
    kind: "section-cancelled",
    sectionCode: "POLI1004.03",
    courseName: "Lịch sử Đảng Cộng sản Việt Nam",
    actor: "Phòng Đào tạo",
    channel: "Hủy lớp dưới sĩ số",
    note: "Lớp chỉ có 9/60 sinh viên nên bị hủy. Đã gợi ý lớp POLI1004.01 còn 12 chỗ, bạn chưa chuyển lớp",
  });
  return events.toSorted((a, b) => b.at.localeCompare(a.at));
}
