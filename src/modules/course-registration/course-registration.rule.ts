import { z } from "zod";
import { periodLabel, weekdayLabel } from "@/shared/constants/period.constant";
import { audienceText, overlaps } from "@/modules/course-registration/course-registration.constant";
import type { ClassMeeting, ClassSection, RegistrationHold, StudentEnrollment } from "@/modules/course-registration/course-registration.type";

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
  planned: ClassSection[];
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

export function chosenMeetings(section: ClassSection, labChoices: Record<string, string> = {}): ClassMeeting[] {
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

export function seatsAvailableFor(section: ClassSection, student?: RegistrationStudent) {
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

export function evaluateSection(section: ClassSection, context: EligibilityContext): RegistrationIssue[] {
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

export function basketProblems<T extends ClassSection>(basket: T[], context: Omit<EligibilityContext, "planned">) {
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

export type CreditRules = { minPerTerm: number; maxPerTerm: number; maxSummer: number; maxWhenWarned: number };

export type CreditLimits = {
  min: number;
  max: number;
  // Lý do hạn mức tối đa thấp hơn mức thường (cảnh báo học vụ, hạn mức của đợt), hiện cạnh số tín chỉ.
  note?: string;
  // Lý do được đăng ký dưới mức tối thiểu của quy chế (học kỳ hè, sắp hoàn thành chương trình).
  minNote?: string;
};

// Hạn mức tín chỉ một học kỳ, dùng chung cho trang đăng ký và server. Học kỳ hè theo maxSummer và không bắt tối thiểu;
// bị cảnh báo học vụ (đã ban hành) thì tối đa maxWhenWarned; đợt đăng ký đặt hạn mức riêng thì giới hạn thêm;
// sinh viên chỉ còn ít tín chỉ hơn mức tối thiểu để hoàn thành chương trình thì tối thiểu là số còn lại.
export function creditLimitsOf(params: {
  rules: CreditRules;
  semester: number;
  warningLevel: number;
  period?: { minCredits: number | null; maxCredits: number | null } | null;
  remainingCredits?: number | null;
}): CreditLimits {
  const { rules, semester, warningLevel, period, remainingCredits } = params;
  const isSummer = semester === 3;
  let max = isSummer ? rules.maxSummer : rules.maxPerTerm;
  let note: string | undefined;
  if (warningLevel > 0 && rules.maxWhenWarned < max) {
    max = rules.maxWhenWarned;
    note = `Sinh viên bị cảnh báo học vụ mức ${warningLevel} chỉ được đăng ký tối đa ${max} tín chỉ.`;
  }
  if (period && period.maxCredits !== null && period.maxCredits < max) {
    max = period.maxCredits;
    note = `Đợt đăng ký này cho đăng ký tối đa ${max} tín chỉ.`;
  }
  let min = isSummer ? 0 : rules.minPerTerm;
  let minNote: string | undefined = isSummer ? "Học kỳ hè không bắt buộc số tín chỉ tối thiểu." : undefined;
  if (period && period.minCredits !== null && period.minCredits > min) {
    min = period.minCredits;
    minNote = undefined;
  }
  if (remainingCredits !== null && remainingCredits !== undefined && remainingCredits < min) {
    min = Math.max(0, remainingCredits);
    minNote = `Bạn chỉ còn ${min} tín chỉ để hoàn thành chương trình nên được đăng ký dưới mức tối thiểu.`;
  }
  return { min: Math.min(min, max), max, note, minNote };
}

// Hủy lớp không được làm tổng tín chỉ xuống dưới mức tối thiểu, như khi đăng ký; muốn đổi lớp thì dùng Đổi lớp.
export function dropCreditProblem(creditsAfter: number, limits: CreditLimits) {
  if (creditsAfter >= limits.min) return null;
  return `Hủy lớp này còn ${creditsAfter} tín chỉ, dưới mức tối thiểu ${limits.min} tín chỉ của học kỳ. Đăng ký lớp khác trước, dùng Đổi lớp, hoặc gửi đơn rút học phần.`;
}

// Học phần song hành: còn học phần khác trong học kỳ bắt buộc học cùng học phần sắp hủy (và chưa đạt) thì không hủy riêng được.
export function corequisiteDependents(dropCode: string, remainingCodes: string[], corequisites: Record<string, string[]>, passed: (code: string) => boolean) {
  if (passed(dropCode)) return [];
  return remainingCodes.filter((code) => code !== dropCode && (corequisites[code] ?? []).includes(dropCode));
}

export function blockingHolds(holds: RegistrationHold[]) {
  return holds.filter((hold) => hold.blocking && !hold.releasedAt);
}

// Thời khóa biểu của sinh viên là mọi lớp đang đăng ký (đã đọc từ bảng enrollments), xếp theo mã lớp.
// Tham số sau enrollments là chữ ký cũ, không dùng; vài trang ngoài phần đăng ký học phần còn truyền, bỏ khi sửa các trang đó.
export function pickTimetable(enrollments: StudentEnrollment[], ..._legacy: unknown[]) {
  return [...enrollments].toSorted((a, b) => a.section.code.localeCompare(b.section.code));
}

// Điểm của LẦN HỌC CUỐI mỗi học phần (quy chế: học lại, học cải thiện lấy lần cuối): "đã học đạt" khi kiểm tiên quyết và học cải
// thiện dựa trên điểm này. Các học kỳ phải xếp theo thời gian, học kỳ đang học (chưa có điểm) bỏ qua.
// Tạm đặt ở đây; khi grades.rule có hàm chung cùng ngữ nghĩa thì dùng hàm đó.
export function lastAttemptGrades(terms: { isInProgress: boolean; courses: { courseCode: string; letter: string | null }[] }[]) {
  const last: Record<string, string> = {};
  for (const term of terms) {
    if (term.isInProgress) continue;
    for (const course of term.courses) if (course.letter) last[course.courseCode] = course.letter;
  }
  return last;
}

/** @deprecated Tên cũ, nay theo lần học cuối (lastAttemptGrades). */
export const bestGrades = lastAttemptGrades;

// Học phần sinh viên đang học ở học kỳ hiện tại thì chưa đăng ký lại ở học kỳ sau. Đăng ký (điều chỉnh) ngay trong học kỳ hiện tại
// thì các lớp đó là lớp đã đăng ký, không phải "đang học".
export function inProgressCodesFor(targetTermId: string, currentTermId: string, currentTermCourseCodes: string[]) {
  return targetTermId === currentTermId ? [] : [...new Set(currentTermCourseCodes)];
}

type PeriodWindow = { cohorts: number[]; opensAt: string; closesAt: string };

// Đợt áp dụng cho một khóa: đợt đang mở (mở muộn nhất nếu nhiều đợt cùng mở), không có thì đợt sắp mở gần nhất, không có nữa thì
// đợt vừa đóng. Trang sinh viên, trang quản trị, phiếu đăng ký và server cùng chọn đợt bằng hàm này.
export function applicablePeriod<T extends PeriodWindow>(periods: T[], cohort: number, now: Date = new Date()): T | null {
  const time = now.getTime();
  const mine = periods.filter((period) => period.cohorts.includes(cohort));
  const opens = (period: T) => new Date(period.opensAt).getTime();
  const closes = (period: T) => new Date(period.closesAt).getTime();
  const open = mine.filter((period) => opens(period) <= time && time < closes(period)).toSorted((a, b) => opens(b) - opens(a));
  if (open[0]) return open[0];
  const upcoming = mine.filter((period) => opens(period) > time).toSorted((a, b) => opens(a) - opens(b));
  if (upcoming[0]) return upcoming[0];
  return mine.filter((period) => closes(period) <= time).toSorted((a, b) => closes(b) - closes(a))[0] ?? null;
}

export const REGISTER_SCHEMA = z.object({
  sectionIds: z
    .array(z.uuid())
    .min(1, "Chọn ít nhất 1 lớp để đăng ký")
    .max(15, "Mỗi lần đăng ký tối đa 15 lớp")
    .transform((ids) => [...new Set(ids)]),
  labChoices: z.record(z.uuid(), z.uuid()).default({}),
});

export type RegisterInput = z.input<typeof REGISTER_SCHEMA>;

const meetingSchema = z
  .object({
    dayOfWeek: z.int().min(2).max(8),
    startPeriod: z.int().min(1).max(12),
    endPeriod: z.int().min(1).max(12),
    room: z.string().trim().min(1, "Chưa chọn phòng"),
  })
  .refine((meeting) => meeting.startPeriod <= meeting.endPeriod, { path: ["endPeriod"], message: "Tiết kết thúc không trước tiết bắt đầu" });

// Dữ liệu form mở/sửa lớp học phần; DB còn chặn thêm sĩ số, khoảng tiết, tổng chỗ dành riêng.
export const CLASS_SECTION_SCHEMA = z
  .object({
    courseCode: z.string().trim().regex(/^[A-Z]{4}\d{4}$/, "Chưa chọn học phần"),
    sectionNumber: z.int().min(1).max(99),
    lecturerId: z.uuid().nullish(),
    capacity: z.int("Chưa nhập sĩ số").min(1).max(500),
    status: z.enum(["draft", "open", "cancelled"]),
    meetings: z.array(meetingSchema).min(1, "Lớp cần ít nhất một buổi học trong tuần").max(7),
    minEnrollment: z.int().min(0),
    audienceMajors: z.array(z.string()).default([]),
    audienceCohorts: z.array(z.int()).default([]),
    audienceNote: z.string().trim().max(300).nullish(),
    reservedSeats: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Chưa nhập tên nhóm dành riêng").max(120),
          seats: z.int().min(1),
          majorCodes: z.array(z.string()).default([]),
          cohorts: z.array(z.int()).default([]),
        }),
      )
      .default([]),
    labGroups: z
      .array(
        z
          .object({
            code: z.string().trim().regex(/^TH\d{1,2}$/, "Mã nhóm dạng TH1, TH2"),
            dayOfWeek: z.int().min(2).max(8),
            startPeriod: z.int().min(1).max(12),
            endPeriod: z.int().min(1).max(12),
            room: z.string().trim().min(1, "Chưa chọn phòng"),
            capacity: z.int().min(1),
          })
          .refine((group) => group.startPeriod <= group.endPeriod, { path: ["endPeriod"], message: "Tiết kết thúc không trước tiết bắt đầu" }),
      )
      .default([]),
  })
  .refine((section) => section.minEnrollment <= section.capacity, { path: ["minEnrollment"], message: "Sĩ số tối thiểu không lớn hơn sĩ số tối đa" })
  .refine((section) => section.reservedSeats.reduce((sum, seat) => sum + seat.seats, 0) <= section.capacity, {
    path: ["reservedSeats"],
    message: "Tổng chỗ dành riêng vượt sĩ số tối đa",
  })
  .refine((section) => new Set(section.labGroups.map((group) => group.code)).size === section.labGroups.length, { path: ["labGroups"], message: "Mã nhóm thực hành bị trùng" })
  .refine((section) => new Set(section.reservedSeats.map((seat) => seat.label)).size === section.reservedSeats.length, {
    path: ["reservedSeats"],
    message: "Tên nhóm dành riêng bị trùng",
  });

export type ClassSectionInput = z.input<typeof CLASS_SECTION_SCHEMA>;

export const PERIOD_SCHEMA = z
  .object({
    name: z.string().trim().min(1, "Chưa nhập tên đợt").max(120),
    cohorts: z
      .array(z.int().min(1).max(99))
      .min(1, "Chọn ít nhất một khóa")
      .transform((cohorts) => [...new Set(cohorts)].toSorted((a, b) => a - b)),
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
    // Bỏ trống là theo quy chế đang áp dụng.
    minCredits: z.int().min(0).max(40).nullable().default(null),
    maxCredits: z.int().min(1).max(40).nullable().default(null),
  })
  .refine((period) => new Date(period.opensAt) < new Date(period.closesAt), { path: ["range"], message: "Thời điểm đóng phải sau thời điểm mở" })
  .refine((period) => period.minCredits === null || period.maxCredits === null || period.minCredits <= period.maxCredits, { path: ["minCredits"], message: "Tối thiểu không lớn hơn tối đa" });

export type PeriodInput = z.input<typeof PERIOD_SCHEMA>;

export const HOLD_SCHEMA = z.object({
  studentId: z.uuid("Chưa chọn sinh viên"),
  kind: z.enum(["tuition", "discipline", "documents", "academic-status", "advisor"]),
  blocking: z.boolean(),
  reason: z.string().trim().min(1, "Chưa nhập lý do").max(300),
  resolveHint: z.string().trim().min(1, "Chưa nhập cách gỡ").max(300),
});

export type HoldInput = z.input<typeof HOLD_SCHEMA>;

export const ADMIN_REGISTER_SCHEMA = z.object({
  studentId: z.uuid(),
  sectionId: z.uuid("Chưa chọn lớp"),
  labGroupId: z.uuid().nullish(),
  reason: z.string().trim().min(1, "Ghi lý do đăng ký hộ").max(300),
  // Bỏ qua điều kiện học vụ (tiên quyết, song hành, đối tượng, hạn mức, khóa đăng ký); lý do ghi vào lịch sử. Sĩ số, trùng lịch vẫn chặn.
  override: z.boolean().default(false),
});

// Đổi sang lớp khác cùng học phần, hoặc đổi nhóm thực hành trong cùng lớp (toSectionId trùng fromSectionId), trong một bước.
export const SWAP_SCHEMA = z.object({
  fromSectionId: z.uuid(),
  toSectionId: z.uuid("Chưa chọn lớp mới"),
  labGroupId: z.uuid().nullish(),
});

export type SwapInput = z.input<typeof SWAP_SCHEMA>;

const isoDate = z.iso.date("Chưa chọn ngày");

export const TERM_SCHEMA = z
  .object({
    academicYear: z.int("Chưa nhập năm học").min(2000).max(2100),
    semester: z.int().min(1).max(3),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((term) => term.startDate < term.endDate, { path: ["endDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" });

export type TermInput = z.input<typeof TERM_SCHEMA>;

// Mã, tên học kỳ sinh theo năm học và học kỳ, cùng mẫu với dữ liệu đang có ("2026-2027.1", "Học kỳ 1, năm học 2026-2027").
export function termNaming(academicYear: number, semester: number) {
  const years = `${academicYear}-${academicYear + 1}`;
  const label = semester === 3 ? "Học kỳ hè" : `Học kỳ ${semester}`;
  return { code: `${years}.${semester}`, name: `${label}, năm học ${years}`, shortName: semester === 3 ? `Hè ${years}` : `HK${semester} ${years}` };
}

export type AdminRegisterInput = z.input<typeof ADMIN_REGISTER_SCHEMA>;

// Mã xác thực của phiếu đăng ký: băm sinh viên, học kỳ và các lớp đang học; đổi lớp là đổi mã. Trang và bản PDF dùng chung.
export function receiptVerificationCode(studentId: string, termId: string, sectionIds: string[]) {
  const value = `${studentId}:${termId}:${sectionIds.join(",")}`;
  const hash = [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
  return hash.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

// Phiếu xác nhận theo lúc đóng đợt áp dụng của khóa (applicablePeriod); học kỳ chưa có đợt thì theo lần đăng ký gần nhất, rồi ngày bắt đầu học kỳ.
export function receiptConfirmedAt(periods: { cohorts: number[]; opensAt: string; closesAt: string }[], cohort: number, events: { at: string }[], termStart: string, now: Date = new Date()) {
  return applicablePeriod(periods, cohort, now)?.closesAt ?? events[0]?.at ?? termStart;
}
