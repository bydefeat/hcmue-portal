import type { Permission } from "@/modules/access/access.type";

export type LetterStep = {
  letter: string;
  min: number;
  point4: number;
};

export type StandingThresholds = {
  excellent: number;
  veryGood: number;
  good: number;
  average: number;
  weak: number;
};

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type DisciplineLevel = "reprimand" | "warning" | "suspension" | "expulsion";

export type RankedStanding = "excellent" | "very-good" | "good" | "average";

export type RegulationSettings = {
  version: string;
  effectiveFrom: string;
  updatedAt: string;
  updatedBy: string;
  grading: {
    scale: LetterStep[];
    roundingStep: 0.1 | 0.5 | 1;
    standing: StandingThresholds;
    incompleteTerms: number;
  };
  credits: {
    minPerTerm: number;
    maxPerTerm: number;
    maxSummer: number;
    maxWhenWarned: number;
    overloadMinCpa: number;
    overloadExtraCredits: number;
  };
  warning: {
    level1TermGpa: number;
    level1FailedCredits: number;
    level2Cpa: number;
    level2FailedCredits: number;
    level3Cpa: number;
    expelAfterWarnings: number;
  };
  attendance: {
    absenceLimitPercent: number;
  };
  workflow: {
    gradeEntryDays: number;
    gradeDueSoonDays: number;
    studyPlanReviewDays: number;
    regradeWindowDays: number;
    registrationClosingSoonHours: number;
    withdrawDeadlineWeeks: number;
    maxReserveTerms: number;
  };
  graduation: {
    retakeLimitPercent: number;
    downgradeDisciplineLevel: DisciplineLevel;
    downgradeStandings: RankedStanding[];
    languageMinLevel: CefrLevel;
    requireItCertificate: boolean;
  };
};

export type CalendarEventKind = "teaching" | "registration" | "exam" | "grading" | "holiday" | "event";

export type CalendarEvent = {
  id: string;
  termId: string;
  kind: CalendarEventKind;
  title: string;
  startDate: string;
  endDate: string;
  audience: string;
  source: "manual" | "term" | "registration";
};

export type ManualCalendarEventKind = Exclude<CalendarEventKind, "teaching" | "registration">;

export type RegulationVersion = {
  version: string;
  effectiveFrom: string;
  decision: string;
  summary: string;
};

export type ReportFormat = "xlsx" | "pdf" | "csv";

export type ReportCell = string | number | { value: number; text: string; numFmt: string };

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  audience: string;
  usesTerm: boolean;
  facultyBasis: "student" | "course";
  permission: Permission;
};

export type ReportExportStatus = "running" | "ready" | "failed";

export type ReportExportJob = {
  id: string;
  reportId: string;
  reportName: string;
  params: string;
  format: string;
  createdAt: string;
  createdBy: string;
  status: ReportExportStatus;
  rows: number | null;
};
