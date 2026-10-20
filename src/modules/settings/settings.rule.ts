import { z } from "zod";
import type { AuditChange } from "@/modules/audit/audit.type";
import { REGULATION_FIELD_LABEL, REPORT_DEFINITIONS, REPORT_FORMATS } from "@/modules/settings/settings.constant";
import type { RegulationRules } from "@/modules/settings/settings.schema";
import type { ReportCell } from "@/modules/settings/settings.type";

const decimal = (min: number, max: number) => z.number("Chưa nhập").min(min, `Không nhỏ hơn ${min}`).max(max, `Không lớn hơn ${max}`);
const whole = (min: number, max: number) => z.int("Phải là số nguyên").min(min, `Không nhỏ hơn ${min}`).max(max, `Không lớn hơn ${max}`);

const LETTER_STEP = z.object({
  letter: z.string().trim().min(1, "Chưa nhập điểm chữ").max(3, "Tối đa 3 ký tự"),
  min: decimal(0, 10),
  point4: decimal(0, 4),
});

// Quy chế lưu jsonb nên phải kiểm đủ từng tham số ở đây; DB chỉ kiểm có đủ 5 nhóm (regulations_rules_object).
export const REGULATION_RULES_SCHEMA = z.object({
  grading: z.object({
    scale: z
      .array(LETTER_STEP)
      .min(2, "Thang điểm cần ít nhất 2 mức")
      .max(12, "Tối đa 12 mức")
      .refine((scale) => scale.every((step, index) => index === 0 || step.min < scale[index - 1].min), "Thang điểm chữ phải xếp ngưỡng giảm dần từ A đến F")
      .refine((scale) => scale.every((step, index) => index === 0 || step.point4 <= scale[index - 1].point4), "Điểm thang 4 không được tăng khi ngưỡng giảm")
      .refine((scale) => scale.at(-1)?.min === 0, "Mức thấp nhất phải bắt đầu từ 0 điểm"),
    passScore: decimal(0, 10),
    roundingStep: decimal(0.1, 1),
  }),
  credits: z
    .object({
      minPerTerm: whole(0, 30),
      maxPerTerm: whole(1, 40),
      maxSummer: whole(0, 20),
      maxWhenWarned: whole(0, 30),
      overloadMinCpa: decimal(0, 4),
    })
    .refine((credits) => credits.minPerTerm <= credits.maxPerTerm, { path: ["maxPerTerm"], message: "Không nhỏ hơn số tín chỉ tối thiểu" })
    .refine((credits) => credits.maxWhenWarned <= credits.maxPerTerm, { path: ["maxWhenWarned"], message: "Không vượt số tín chỉ tối đa mỗi học kỳ" }),
  warning: z
    .object({
      level1TermGpa: decimal(0, 4),
      level1FailedCredits: whole(0, 60),
      level2Cpa: decimal(0, 4),
      level2FailedCredits: whole(0, 60),
      level3Cpa: decimal(0, 4),
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
  }),
});

export const REGULATION_SAVE_SCHEMA = z.object({
  rules: REGULATION_RULES_SCHEMA,
  decision: z.string().trim().min(1, "Chưa nhập số quyết định").max(60, "Tối đa 60 ký tự"),
  reason: z.string().trim().min(1, "Chưa nhập căn cứ thay đổi").max(300, "Tối đa 300 ký tự"),
  effectiveFrom: z.iso.date("Chưa chọn ngày áp dụng"),
});

export type RegulationSaveInput = z.input<typeof REGULATION_SAVE_SCHEMA>;

// Số hiệu phiên bản theo năm áp dụng: 2026.1, 2026.2...
export function nextRegulationVersion(versions: string[], effectiveFrom: string) {
  const year = effectiveFrom.slice(0, 4);
  const used = versions.filter((version) => version.startsWith(`${year}.`)).map((version) => Number(version.slice(5)) || 0);
  return `${year}.${Math.max(0, ...used) + 1}`;
}

function formatValue(value: number) {
  return String(value).replace(".", ",");
}

function valueAt(rules: RegulationRules, path: string) {
  const [group, key] = path.split(".") as [keyof RegulationRules, string];
  return (rules[group] as Record<string, number>)[key];
}

// Các tham số đổi giữa hai bản quy chế, ghi vào nhật ký thao tác.
export function regulationChanges(before: RegulationRules, after: RegulationRules): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [path, field] of Object.entries(REGULATION_FIELD_LABEL)) {
    const previous = valueAt(before, path);
    const next = valueAt(after, path);
    if (previous !== next) changes.push({ field, before: formatValue(previous), after: formatValue(next) });
  }
  const letters = [...new Set([...before.grading.scale, ...after.grading.scale].map((step) => step.letter))];
  for (const letter of letters) {
    const previous = before.grading.scale.find((step) => step.letter === letter);
    const next = after.grading.scale.find((step) => step.letter === letter);
    if (previous?.min !== next?.min) changes.push({ field: `Điểm ${letter}: từ điểm`, before: previous ? formatValue(previous.min) : "Không có", after: next ? formatValue(next.min) : "Không có" });
    if (previous?.point4 !== next?.point4) changes.push({ field: `Điểm ${letter}: thang 4`, before: previous ? formatValue(previous.point4) : "Không có", after: next ? formatValue(next.point4) : "Không có" });
  }
  return changes;
}

export const CALENDAR_EVENT_SCHEMA = z
  .object({
    termId: z.uuid("Chưa chọn học kỳ"),
    kind: z.enum(["teaching", "registration", "exam", "grading", "holiday", "event"], "Chưa chọn loại"),
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

// Tên tệp theo định dạng đã chọn lúc xuất; job cũ không lưu định dạng thì là CSV.
export function reportFileName(reportKey: string, termCode: string, format: string | undefined) {
  return `${reportKey}-${termCode}.${format === "xlsx" || format === "pdf" ? format : "csv"}`;
}
