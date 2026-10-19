export type LetterStep = {
  letter: string;
  min: number;
  point4: number;
};

export type RegulationSettings = {
  version: string;
  effectiveFrom: string;
  updatedAt: string;
  updatedBy: string;
  grading: {
    scale: LetterStep[];
    passScore: number;
    roundingStep: number;
  };
  credits: {
    minPerTerm: number;
    maxPerTerm: number;
    maxSummer: number;
    maxWhenWarned: number;
    overloadMinCpa: number;
  };
  warning: {
    level1TermGpa: number;
    level1FailedCredits: number;
    level2Cpa: number;
    level2FailedCredits: number;
    level3Cpa: number;
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
};

export type RegulationVersion = {
  version: string;
  effectiveFrom: string;
  decision: string;
  summary: string;
};

export type ReportFormat = "xlsx" | "csv";

// Ô số kèm định dạng: Excel nhận giá trị số với định dạng hiển thị, CSV nhận chữ đã định dạng kiểu Việt Nam.
export type ReportCell = string | number | { value: number; text: string; numFmt: string };

export type ReportDefinition = { id: string; name: string; description: string; audience: string };

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
