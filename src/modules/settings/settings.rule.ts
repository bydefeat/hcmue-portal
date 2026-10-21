import { z } from "zod";
import type { AuditChange } from "@/modules/audit/audit.type";
import { dayjs } from "@/shared/libs/date.lib";
import {
  CALENDAR_TERM_MARGIN_DAYS,
  CEFR_LEVELS,
  DISCIPLINE_LEVEL_LABEL,
  DISCIPLINE_LEVELS,
  MANUAL_CALENDAR_EVENT_KINDS,
  RANKED_STANDING_LABEL,
  REGULATION_FIELD_LABEL,
  REPORT_DEFINITIONS,
  REPORT_FORMATS,
  ROUNDING_STEPS,
  type RegulationFieldPath,
} from "@/modules/settings/settings.constant";
import type { RegulationRules } from "@/modules/settings/settings.schema";
import type { CefrLevel, DisciplineLevel, RankedStanding, ReportCell } from "@/modules/settings/settings.type";

const decimal = (min: number, max: number) => z.number("Chưa nhập").min(min, `Không nhỏ hơn ${min}`).max(max, `Không lớn hơn ${max}`);
const whole = (min: number, max: number) => z.int("Phải là số nguyên").min(min, `Không nhỏ hơn ${min}`).max(max, `Không lớn hơn ${max}`);

const LETTER_STEP = z.object({
  letter: z.string().trim().min(1, "Chưa nhập điểm chữ").max(3, "Tối đa 3 ký tự"),
  min: decimal(0, 10),
  point4: decimal(0, 4),
});

const STANDING = z
  .object({ excellent: decimal(0, 4), veryGood: decimal(0, 4), good: decimal(0, 4), average: decimal(0, 4), weak: decimal(0, 4) })
  .refine((standing) => standing.excellent > standing.veryGood, { path: ["veryGood"], message: "Thấp hơn ngưỡng Xuất sắc" })
  .refine((standing) => standing.veryGood > standing.good, { path: ["good"], message: "Thấp hơn ngưỡng Giỏi" })
  .refine((standing) => standing.good > standing.average, { path: ["average"], message: "Thấp hơn ngưỡng Khá" })
  .refine((standing) => standing.average > standing.weak, { path: ["weak"], message: "Thấp hơn ngưỡng Trung bình" });

export const REGULATION_RULES_SCHEMA = z.object({
  grading: z.object({
    scale: z
      .array(LETTER_STEP)
      .min(2, "Thang điểm cần ít nhất 2 mức")
      .max(12, "Tối đa 12 mức")
      .refine((scale) => scale.every((step, index) => index === 0 || step.min < scale[index - 1].min), "Thang điểm chữ phải xếp ngưỡng giảm dần từ A đến F")
      .refine((scale) => scale.every((step, index) => index === 0 || step.point4 <= scale[index - 1].point4), "Điểm thang 4 không được tăng khi ngưỡng giảm")
      .refine((scale) => scale.at(-1)?.min === 0 && scale.at(-1)?.letter === "F", "Mức thấp nhất phải là F, bắt đầu từ 0 điểm")
      .refine((scale) => scale.every((step) => Number.isInteger(Math.round(step.min * 1000) / 100)), "Ngưỡng điểm chữ lấy tối đa một chữ số thập phân"),
    roundingStep: z.literal([...ROUNDING_STEPS], "Chọn 0,1, 0,5 hoặc 1"),
    standing: STANDING,
    incompleteTerms: whole(1, 4),
  }),
  credits: z
    .object({
      minPerTerm: whole(0, 30),
      maxPerTerm: whole(1, 40),
      maxSummer: whole(0, 20),
      maxWhenWarned: whole(0, 30),
      overloadMinCpa: decimal(0, 4),
      overloadExtraCredits: whole(1, 15),
    })
    .refine((credits) => credits.minPerTerm <= credits.maxPerTerm, { path: ["maxPerTerm"], message: "Không nhỏ hơn số tín chỉ tối thiểu" })
    .refine((credits) => credits.maxWhenWarned <= credits.maxPerTerm, { path: ["maxWhenWarned"], message: "Không vượt số tín chỉ tối đa mỗi học kỳ" }),
  warning: z
    .object({
      level1TermGpa: decimal(0, 4),
      level1FailedCredits: whole(1, 60),
      level2Cpa: decimal(0, 4),
      level2FailedCredits: whole(1, 60),
      level3Cpa: decimal(0, 4),
      expelAfterWarnings: whole(1, 6),
    })
    .refine((warning) => warning.level3Cpa <= warning.level2Cpa, { path: ["level3Cpa"], message: "Ngưỡng mức 3 không cao hơn mức 2" })
    .refine((warning) => warning.level1FailedCredits <= warning.level2FailedCredits, { path: ["level2FailedCredits"], message: "Mức 2 phải nợ nhiều tín chỉ hơn mức 1" }),
  attendance: z.object({ absenceLimitPercent: whole(0, 100) }),
  workflow: z.object({
    gradeEntryDays: whole(1, 30),
    gradeDueSoonDays: whole(1, 14),
    studyPlanReviewDays: whole(1, 14),
    regradeWindowDays: whole(1, 30),
    registrationClosingSoonHours: whole(1, 168),
    withdrawDeadlineWeeks: whole(1, 20),
    maxReserveTerms: whole(1, 8),
  }),
  graduation: z.object({
    retakeLimitPercent: decimal(0, 100),
    downgradeDisciplineLevel: z.enum(DISCIPLINE_LEVELS as [DisciplineLevel, ...DisciplineLevel[]], "Chọn mức kỷ luật"),
    downgradeStandings: z
      .array(z.enum(["excellent", "very-good", "good", "average"]))
      .max(4)
      .transform((standings) => (["excellent", "very-good", "good", "average"] as const).filter((standing) => standings.includes(standing))),
    languageMinLevel: z.enum(CEFR_LEVELS as [CefrLevel, ...CefrLevel[]], "Chọn bậc ngoại ngữ"),
    requireItCertificate: z.boolean(),
  }),
});

export const REGULATION_SAVE_SCHEMA = z.object({
  rules: REGULATION_RULES_SCHEMA,
  decision: z.string().trim().min(1, "Chưa nhập số quyết định").max(60, "Tối đa 60 ký tự"),
  reason: z.string().trim().min(1, "Chưa nhập căn cứ thay đổi").max(300, "Tối đa 300 ký tự"),
  effectiveFrom: z.iso.date("Chưa chọn ngày áp dụng"),
});

export type RegulationSaveInput = z.input<typeof REGULATION_SAVE_SCHEMA>;

export function nextRegulationVersion(versions: string[], effectiveFrom: string) {
  const year = effectiveFrom.slice(0, 4);
  const used = versions.filter((version) => version.startsWith(`${year}.`)).map((version) => Number(version.slice(5)) || 0);
  return `${year}.${Math.max(0, ...used) + 1}`;
}

function formatValue(path: RegulationFieldPath, value: unknown): string {
  if (value === undefined || value === null) return "Không có";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (Array.isArray(value)) return value.length === 0 ? "Không có" : value.map((item) => RANKED_STANDING_LABEL[item as RankedStanding] ?? String(item)).join(", ");
  if (path === "graduation.downgradeDisciplineLevel") return DISCIPLINE_LEVEL_LABEL[value as DisciplineLevel] ?? String(value);
  return String(value).replace(".", ",");
}

function valueAt(rules: RegulationRules, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), rules);
}

const point = (value: number | undefined) => (value === undefined ? "Không có" : String(value).replace(".", ","));

export function regulationChanges(before: RegulationRules, after: RegulationRules): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [path, field] of Object.entries(REGULATION_FIELD_LABEL) as [RegulationFieldPath, string][]) {
    const previous = formatValue(path, valueAt(before, path));
    const next = formatValue(path, valueAt(after, path));
    if (previous !== next) changes.push({ field, before: previous, after: next });
  }
  const letters = [...new Set([...before.grading.scale, ...after.grading.scale].map((step) => step.letter))];
  for (const letter of letters) {
    const previous = before.grading.scale.find((step) => step.letter === letter);
    const next = after.grading.scale.find((step) => step.letter === letter);
    if (previous?.min !== next?.min) changes.push({ field: `Điểm ${letter}: từ điểm`, before: point(previous?.min), after: point(next?.min) });
    if (previous?.point4 !== next?.point4) changes.push({ field: `Điểm ${letter}: thang 4`, before: point(previous?.point4), after: point(next?.point4) });
  }
  return changes;
}

export const CALENDAR_EVENT_SCHEMA = z
  .object({
    termId: z.uuid("Chưa chọn học kỳ"),
    kind: z.enum(MANUAL_CALENDAR_EVENT_KINDS, "Chưa chọn loại (thời gian học kỳ, đợt đăng ký sửa ở trang Học kỳ)"),
    title: z.string().trim().min(1, "Chưa nhập tên mốc").max(160, "Tối đa 160 ký tự"),
    startDate: z.iso.date("Chưa chọn thời gian"),
    endDate: z.iso.date("Chưa chọn thời gian"),
    audience: z.string().trim().min(1, "Chưa nhập đối tượng").max(120, "Tối đa 120 ký tự"),
  })
  .refine((event) => event.startDate <= event.endDate, { path: ["endDate"], message: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu" });

export type CalendarEventInput = z.input<typeof CALENDAR_EVENT_SCHEMA>;

const REPORT_KEYS = REPORT_DEFINITIONS.map((report) => report.id) as [string, ...string[]];

export const REPORT_EXPORT_SCHEMA = z.object({
  reportKey: z.enum(REPORT_KEYS, "Báo cáo không có trong danh mục"),
  termId: z.uuid("Chưa chọn học kỳ"),
  faculty: z.string().trim().min(1, "Chưa chọn phạm vi"),
  format: z.enum(REPORT_FORMATS, "Chưa chọn định dạng"),
});

export type ReportExportInput = z.input<typeof REPORT_EXPORT_SCHEMA>;

export function reportCellText(cell: ReportCell): string | number {
  return typeof cell === "object" ? cell.text : cell;
}

export function reportFileName(reportKey: string, termCode: string | null, format: string | undefined, exportedOn?: string) {
  const suffix = termCode ?? exportedOn ?? "hien-tai";
  return `${reportKey}-${suffix}.${format === "xlsx" || format === "pdf" ? format : "csv"}`;
}

export function calendarEventTermReason(event: { startDate: string; endDate: string }, term: { startDate: string; endDate: string; shortName: string }) {
  const from = dayjs(term.startDate).subtract(CALENDAR_TERM_MARGIN_DAYS, "day");
  const to = dayjs(term.endDate).add(CALENDAR_TERM_MARGIN_DAYS, "day");
  if (dayjs(event.startDate).isBefore(from, "day") || dayjs(event.endDate).isAfter(to, "day")) {
    return `Mốc phải nằm trong ${term.shortName} (${dayjs(term.startDate).format("DD/MM/YYYY")} - ${dayjs(term.endDate).format("DD/MM/YYYY")}, giáp trước sau tối đa ${CALENDAR_TERM_MARGIN_DAYS} ngày).`;
  }
  return null;
}
