import { z } from "zod";
import { GRADUATION_CLASSIFICATION, GRADUATION_MIN_CPA } from "@/modules/graduation/graduation.constant";
import type { GraduationCandidate, GraduationCheck, GraduationInput } from "@/modules/graduation/graduation.type";

function point(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export function evaluateGraduation(input: GraduationInput): GraduationCandidate {
  const checks: GraduationCheck[] = [
    {
      key: "credits",
      label: "Đủ tín chỉ",
      passed: input.earnedCredits >= input.requiredCredits,
      detail: `Tích lũy ${input.earnedCredits}/${input.requiredCredits} tín chỉ`,
    },
    { key: "cpa", label: "CPA từ 2,00", passed: input.cpa4 >= GRADUATION_MIN_CPA, detail: `CPA ${point(input.cpa4)}` },
    { key: "failed", label: "Không nợ học phần", passed: input.failedCredits === 0, detail: input.failedCredits === 0 ? "Không nợ" : `Nợ ${input.failedCredits} tín chỉ` },
    { key: "language", label: "Chuẩn ngoại ngữ", passed: input.languageCertificate !== null, detail: input.languageCertificate ?? "Chưa nộp chứng chỉ" },
    { key: "it", label: "Chuẩn tin học", passed: input.itCertificate !== null, detail: input.itCertificate ?? "Chưa nộp chứng chỉ" },
    { key: "tuition", label: "Hoàn thành học phí", passed: input.tuitionCleared, detail: input.tuitionCleared ? "Đã nộp đủ" : "Còn nợ học phí" },
    { key: "discipline", label: "Không bị kỷ luật", passed: input.disciplineFree, detail: input.disciplineFree ? "Không có quyết định kỷ luật đang hiệu lực" : "Đang chịu kỷ luật" },
  ];
  const passed = checks.every((check) => check.passed);
  return {
    ...input,
    checks,
    status: input.alreadyGraduated ? "graduated" : input.isApproved ? "approved" : passed ? "eligible" : "missing",
    classification: GRADUATION_CLASSIFICATION.find((step) => input.cpa4 >= step.min)!.label,
  };
}

export const GRADUATION_APPROVE_SCHEMA = z.object({
  studentIds: z
    .array(z.uuid())
    .min(1, "Chưa chọn sinh viên nào")
    .max(1000, "Chọn tối đa 1000 sinh viên mỗi lần")
    .transform((ids) => [...new Set(ids)]),
});
