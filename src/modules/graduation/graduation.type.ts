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
  retakeCredits: number;
  missingRequired: { code: string; name: string }[];
  missingConditional: { code: string; name: string }[];
  electives: { name: string; minCredits: number; earnedCredits: number }[];
  certificatesVerifiedAt: string | null;
  outstandingTuition: number;
  disciplines: GraduationDiscipline[];
  alreadyGraduated: boolean;
  isApproved: boolean;
};

export type GraduationCandidate = GraduationInput & {
  requiredCredits: number;
  checks: GraduationCheck[];
  status: GraduationStatus;
  rank: RankedStanding | null;
  baseRank: RankedStanding | null;
  classification: string;
  downgradeReasons: string[];
};

export type GraduationRound = { id: string; name: string; cohorts: number[]; updatedAt: string };
