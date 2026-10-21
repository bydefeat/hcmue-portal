import { z } from "zod";
import type { StudyPlanStatus } from "@/modules/study-plan/study-plan.type";

export type PlanTerm = { academicYear: number; semester: number };

const TERM_NAME = /^Học kỳ (1|2|hè), năm học (\d{4})-(\d{4})$/;

export function termNameOf({ academicYear, semester }: PlanTerm) {
  return `Học kỳ ${semester === 3 ? "hè" : semester}, năm học ${academicYear}-${academicYear + 1}`;
}

export function parseTermName(name: string): PlanTerm | null {
  const match = TERM_NAME.exec(name.trim());
  if (!match) return null;
  const academicYear = Number(match[2]);
  if (Number(match[3]) !== academicYear + 1) return null;
  return { academicYear, semester: match[1] === "hè" ? 3 : Number(match[1]) };
}

export const compareTerms = (a: PlanTerm, b: PlanTerm) => a.academicYear - b.academicYear || a.semester - b.semester;

const COURSE_CODE = /^[A-Z]{4}\d{4}$/;

export const STUDY_PLAN_SCHEMA = z
  .object({
    terms: z
      .array(
        z.object({
          termName: z.string().refine((name) => parseTermName(name) !== null, "Tên học kỳ không hợp lệ"),
          courseCodes: z.array(z.string().trim().regex(COURSE_CODE, "Mã học phần không hợp lệ")).max(15, "Tối đa 15 học phần mỗi học kỳ"),
        }),
      )
      .min(1, "Kế hoạch cần ít nhất một học kỳ")
      .max(6, "Tối đa 6 học kỳ"),
    studentNote: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").default(""),
  })
  .superRefine((plan, context) => {
    const names = plan.terms.map((term) => term.termName);
    if (new Set(names).size !== names.length) context.addIssue({ code: "custom", path: ["terms"], message: "Hai cột trùng học kỳ" });
    const codes = plan.terms.flatMap((term) => term.courseCodes);
    const repeated = codes.filter((code, index) => codes.indexOf(code) !== index);
    if (repeated.length > 0) context.addIssue({ code: "custom", path: ["terms"], message: `Học phần ${[...new Set(repeated)].join(", ")} xếp ở nhiều học kỳ` });
  })
  .transform((plan) => ({
    studentNote: plan.studentNote,
    terms: plan.terms.map((term) => ({ ...parseTermName(term.termName)!, termName: term.termName, courseCodes: term.courseCodes })).toSorted(compareTerms),
  }));

export type StudyPlanInput = z.input<typeof STUDY_PLAN_SCHEMA>;

export const STUDY_PLAN_REVIEW_SCHEMA = z
  .object({
    id: z.uuid(),
    decision: z.enum(["approved", "returned"]),
    comment: z.string().trim().max(500, "Nhận xét tối đa 500 ký tự").default(""),
  })
  .refine((review) => review.decision === "approved" || review.comment.length > 0, {
    path: ["comment"],
    message: "Chưa nhập nhận xét, sinh viên cần biết lý do để sửa",
  });

export type StudyPlanReviewInput = z.input<typeof STUDY_PLAN_REVIEW_SCHEMA>;

export function planEditMode(status: StudyPlanStatus | null): "create" | "update" | "new-version" | "locked" {
  if (status === null) return "create";
  if (status === "draft" || status === "returned") return "update";
  if (status === "approved") return "new-version";
  return "locked";
}

export type CreditLimits = { min: number; max: number };

export type CreditRules = { minPerTerm: number; maxPerTerm: number; maxSummer: number; maxWhenWarned: number };

export function termCreditLimits(term: PlanTerm, credits: CreditRules, warned: boolean): CreditLimits {
  if (term.semester === 3) return { min: 0, max: credits.maxSummer };
  return { min: Math.min(credits.minPerTerm, warned ? credits.maxWhenWarned : credits.maxPerTerm), max: warned ? credits.maxWhenWarned : credits.maxPerTerm };
}

export function termCreditLimitsByName(termName: string, credits: CreditRules, warned: boolean): CreditLimits {
  return termCreditLimits(parseTermName(termName) ?? { academicYear: 0, semester: 1 }, credits, warned);
}

export function termsOutOfRange<T extends { termName: string; credits: number }>(terms: T[], limitsOf: (termName: string) => CreditLimits) {
  return terms.filter((term) => {
    const limits = limitsOf(term.termName);
    return term.credits > limits.max || term.credits < limits.min;
  });
}

export function upcomingPlanTerms(current: PlanTerm, mainTerms = 3): PlanTerm[] {
  const result: PlanTerm[] = [];
  let cursor = current;
  while (result.filter((term) => term.semester !== 3).length < mainTerms) {
    cursor = cursor.semester === 3 ? { academicYear: cursor.academicYear + 1, semester: 1 } : { academicYear: cursor.academicYear, semester: cursor.semester + 1 };
    result.push(cursor);
  }
  return result;
}
