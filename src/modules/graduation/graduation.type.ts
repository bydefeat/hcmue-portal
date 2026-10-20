import type { CefrLevel, DisciplineLevel, RankedStanding } from "@/modules/settings/settings.type";

export type GraduationCheckKey = "program" | "credits" | "required" | "conditional" | "electives" | "cpa" | "failed" | "language" | "it" | "tuition" | "discipline";

export type GraduationCheck = {
  key: GraduationCheckKey;
  label: string;
  passed: boolean;
  detail: string;
};

export type GraduationStatus = "eligible" | "missing" | "approved" | "graduated";

export type GraduationExtras = {
  studentId: string;
  languageCertificate: string | null;
  languageLevel: CefrLevel | null;
  itCertificate: string | null;
};

export type GraduationDiscipline = { title: string; level: DisciplineLevel; effectiveDate: string };

export type GraduationInput = GraduationExtras & {
  code: string;
  fullName: string;
  className: string;
  faculty: string;
  majorName: string;
  cohort: number;
  program: { name: string; totalCredits: number } | null;
  earnedCredits: number;
  cpa4: number | null;
  failedCredits: number;
  // Tổng tín chỉ các lần học bị F (khối lượng phải học lại), so với tỉ lệ giảm hạng của quy chế.
  retakeCredits: number;
  // Học phần bắt buộc trong khung chưa học đạt (kể cả qua học phần tương đương).
  missingRequired: { code: string; name: string }[];
  // Học phần điều kiện (GDTC, GDQP-AN) trong khung chưa Đạt.
  missingConditional: { code: string; name: string }[];
  // Tín chỉ đã tích lũy của từng nhóm tự chọn trong khung so với số tối thiểu.
  electives: { name: string; minCredits: number; earnedCredits: number }[];
  certificatesVerifiedAt: string | null;
  // Số tiền học phí còn nợ trên mọi hóa đơn.
  outstandingTuition: number;
  // Quyết định kỷ luật đã ký, chưa thu hồi trong thời gian học.
  disciplines: GraduationDiscipline[];
  alreadyGraduated: boolean;
  isApproved: boolean;
};

export type GraduationCandidate = GraduationInput & {
  requiredCredits: number;
  checks: GraduationCheck[];
  status: GraduationStatus;
  // Hạng tốt nghiệp sau khi xét giảm hạng; null khi CPA dưới mức Trung bình hoặc chưa có điểm.
  rank: RankedStanding | null;
  baseRank: RankedStanding | null;
  classification: string;
  downgradeReasons: string[];
};

export type GraduationRound = { id: string; name: string; cohorts: number[]; updatedAt: string };
