export type GraduationCheckKey = "credits" | "cpa" | "failed" | "language" | "it" | "tuition" | "discipline";

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
  itCertificate: string | null;
  tuitionCleared: boolean;
  disciplineFree: boolean;
};

export type GraduationInput = GraduationExtras & {
  code: string;
  fullName: string;
  className: string;
  faculty: string;
  majorName: string;
  earnedCredits: number;
  requiredCredits: number;
  cpa4: number;
  failedCredits: number;
  alreadyGraduated: boolean;
};

export type GraduationCandidate = GraduationInput & {
  checks: GraduationCheck[];
  status: GraduationStatus;
  classification: string;
};
