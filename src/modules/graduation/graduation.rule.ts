import { z } from "zod";
import { toStanding } from "@/modules/grades/grades.rule";
import { UNCLASSIFIED_LABEL } from "@/modules/graduation/graduation.constant";
import type { GraduationCandidate, GraduationCheck, GraduationInput } from "@/modules/graduation/graduation.type";
import { CEFR_LEVELS, DISCIPLINE_LEVEL_LABEL, DISCIPLINE_LEVELS, RANKED_STANDING_LABEL } from "@/modules/settings/settings.constant";
import type { CefrLevel, DisciplineLevel, RankedStanding, RegulationSettings } from "@/modules/settings/settings.type";

export type GraduationRules = Pick<RegulationSettings, "graduation"> & { grading: Pick<RegulationSettings["grading"], "standing"> };

const RANK_ORDER: RankedStanding[] = ["excellent", "very-good", "good", "average"];

const atLeast = (level: DisciplineLevel, threshold: DisciplineLevel) => DISCIPLINE_LEVELS.indexOf(level) >= DISCIPLINE_LEVELS.indexOf(threshold);

export function meetsLanguageLevel(level: CefrLevel | null, minimum: CefrLevel) {
  return level !== null && CEFR_LEVELS.indexOf(level) >= CEFR_LEVELS.indexOf(minimum);
}

export function graduationRank(input: Pick<GraduationInput, "cpa4" | "retakeCredits" | "disciplines" | "program">, rules: GraduationRules) {
  const standing = input.cpa4 === null ? null : toStanding(input.cpa4, rules.grading.standing);
  const baseRank = standing && (RANK_ORDER as string[]).includes(standing) ? (standing as RankedStanding) : null;
  const reasons: string[] = [];
  if (baseRank && rules.graduation.downgradeStandings.includes(baseRank)) {
    const totalCredits = input.program?.totalCredits ?? 0;
    const limit = (totalCredits * rules.graduation.retakeLimitPercent) / 100;
    if (totalCredits > 0 && input.retakeCredits > limit) {
      reasons.push(`Học lại ${input.retakeCredits} tín chỉ, vượt ${String(rules.graduation.retakeLimitPercent).replace(".", ",")}% tổng ${totalCredits} tín chỉ của chương trình`);
    }
    const disciplined = input.disciplines.find((entry) => atLeast(entry.level, rules.graduation.downgradeDisciplineLevel));
    if (disciplined) reasons.push(`Bị kỷ luật mức ${DISCIPLINE_LEVEL_LABEL[disciplined.level].toLowerCase()} trong thời gian học`);
  }
  const rank = baseRank && reasons.length > 0 ? RANK_ORDER[Math.min(RANK_ORDER.indexOf(baseRank) + 1, RANK_ORDER.length - 1)] : baseRank;
  return { baseRank, rank, reasons };
}

function point(value: number | null) {
  return value === null ? "chưa có" : value.toFixed(2).replace(".", ",");
}

const money = (value: number) => `${value.toLocaleString("vi-VN")} đ`;

export function evaluateGraduation(input: GraduationInput, rules: GraduationRules): GraduationCandidate {
  const requiredCredits = input.program?.totalCredits ?? 0;
  const minCpa = rules.grading.standing.average;
  const minLanguage = rules.graduation.languageMinLevel;
  const blocking = input.disciplines.filter((entry) => atLeast(entry.level, "suspension"));
  const checks: GraduationCheck[] = [
    {
      key: "program",
      label: "Có chương trình đào tạo",
      passed: input.program !== null,
      detail: input.program ? input.program.name : `Chưa có chương trình đang áp dụng cho ngành, khóa ${input.cohort}`,
    },
    {
      key: "credits",
      label: "Đủ tín chỉ",
      passed: input.program !== null && input.earnedCredits >= requiredCredits,
      detail: input.program ? `Tích lũy ${input.earnedCredits}/${requiredCredits} tín chỉ` : `Tích lũy ${input.earnedCredits} tín chỉ`,
    },
    {
      key: "required",
      label: "Đủ học phần bắt buộc",
      passed: input.program !== null && input.missingRequired.length === 0,
      detail:
        input.missingRequired.length === 0
          ? "Đã học đạt mọi học phần bắt buộc của khung"
          : `Còn thiếu ${input.missingRequired.length} học phần: ${input.missingRequired.map((course) => `${course.code} ${course.name}`).join(", ")}`,
    },
    {
      key: "conditional",
      label: "Đạt học phần điều kiện",
      passed: input.program !== null && input.missingConditional.length === 0,
      detail:
        input.missingConditional.length === 0
          ? "Đạt mọi học phần điều kiện của khung (giáo dục thể chất, quốc phòng và an ninh)"
          : `Chưa đạt ${input.missingConditional.length} học phần: ${input.missingConditional.map((course) => `${course.code} ${course.name}`).join(", ")}`,
    },
    {
      key: "electives",
      label: "Đủ tín chỉ tự chọn",
      passed: input.program !== null && input.electives.every((group) => group.earnedCredits >= group.minCredits),
      detail:
        input.electives.length === 0
          ? "Khung không có nhóm tự chọn"
          : input.electives.map((group) => `${group.name} ${group.earnedCredits}/${group.minCredits} tín chỉ`).join(", "),
    },
    { key: "cpa", label: `CPA từ ${point(minCpa)}`, passed: input.cpa4 !== null && input.cpa4 >= minCpa, detail: `CPA ${point(input.cpa4)}` },
    { key: "failed", label: "Không nợ học phần", passed: input.failedCredits === 0, detail: input.failedCredits === 0 ? "Không nợ" : `Nợ ${input.failedCredits} tín chỉ (lần học cuối F)` },
    {
      key: "language",
      label: `Chuẩn ngoại ngữ ${minLanguage}`,
      passed: meetsLanguageLevel(input.languageLevel, minLanguage),
      detail: input.languageCertificate
        ? `${input.languageCertificate}${input.languageLevel ? `, bậc ${input.languageLevel}` : ", chưa xác nhận bậc"}${input.languageLevel && !meetsLanguageLevel(input.languageLevel, minLanguage) ? `, dưới chuẩn ${minLanguage}` : ""}`
        : "Chưa nộp chứng chỉ",
    },
    {
      key: "it",
      label: "Chuẩn tin học",
      passed: !rules.graduation.requireItCertificate || input.itCertificate !== null,
      detail: input.itCertificate ?? (rules.graduation.requireItCertificate ? "Chưa nộp chứng chỉ" : "Quy chế không bắt buộc"),
    },
    {
      key: "tuition",
      label: "Hoàn thành học phí",
      passed: input.outstandingTuition <= 0,
      detail: input.outstandingTuition <= 0 ? "Không còn nợ hóa đơn học phí" : `Còn nợ ${money(input.outstandingTuition)}`,
    },
    {
      key: "discipline",
      label: "Không đang bị đình chỉ học tập",
      passed: blocking.length === 0,
      detail:
        blocking.length > 0
          ? `Đang chịu kỷ luật mức ${DISCIPLINE_LEVEL_LABEL[blocking[0].level].toLowerCase()}`
          : input.disciplines.length > 0
            ? `Có kỷ luật mức ${DISCIPLINE_LEVEL_LABEL[input.disciplines[0].level].toLowerCase()} (không chặn tốt nghiệp, xét giảm hạng)`
            : "Không có quyết định kỷ luật",
    },
  ];
  const passed = checks.every((check) => check.passed);
  const { baseRank, rank, reasons } = graduationRank(input, rules);
  return {
    ...input,
    requiredCredits,
    checks,
    status: input.alreadyGraduated ? "graduated" : input.isApproved ? "approved" : passed ? "eligible" : "missing",
    baseRank,
    rank,
    classification: rank ? RANKED_STANDING_LABEL[rank] : UNCLASSIFIED_LABEL,
    downgradeReasons: reasons,
  };
}

const studentIds = (max: number, message: string) =>
  z
    .array(z.uuid())
    .min(1, message)
    .max(max, `Chọn tối đa ${max} sinh viên mỗi lần`)
    .transform((ids) => [...new Set(ids)]);

export const GRADUATION_APPROVE_SCHEMA = z.object({ studentIds: studentIds(1000, "Chưa chọn sinh viên nào") });

export const GRADUATION_EXPORT_SCHEMA = z.object({ studentIds: studentIds(5000, "Danh sách đang trống") });

export const GRADUATION_ROUND_SCHEMA = z.object({
  name: z.string().trim().min(1, "Chưa nhập tên đợt").max(120, "Tối đa 120 ký tự"),
  cohorts: z
    .array(z.int().min(1).max(99))
    .min(1, "Chọn ít nhất một khóa")
    .max(10, "Tối đa 10 khóa")
    .transform((cohorts) => [...new Set(cohorts)].toSorted((a, b) => a - b)),
});

export type GraduationRoundInput = z.input<typeof GRADUATION_ROUND_SCHEMA>;

export const GRADUATION_CERTIFICATES_SCHEMA = z
  .object({
    studentId: z.uuid(),
    languageCertificate: z.string().trim().max(120, "Tối đa 120 ký tự").nullable(),
    languageLevel: z.enum(CEFR_LEVELS as [CefrLevel, ...CefrLevel[]], "Chọn bậc ngoại ngữ").nullable(),
    itCertificate: z.string().trim().max(120, "Tối đa 120 ký tự").nullable(),
  })
  .transform((value) => ({
    ...value,
    languageCertificate: value.languageCertificate || null,
    itCertificate: value.itCertificate || null,
    languageLevel: value.languageCertificate ? value.languageLevel : null,
  }))
  .refine((value) => value.languageCertificate === null || value.languageLevel !== null, { path: ["languageLevel"], message: "Chọn bậc tương ứng của chứng chỉ" });

export type GraduationCertificatesInput = z.input<typeof GRADUATION_CERTIFICATES_SCHEMA>;
