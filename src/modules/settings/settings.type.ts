import type { Permission } from "@/modules/access/access.type";

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
  // manual: mốc tự nhập ở trang Lịch năm học (sửa, xóa được); term, registration: lấy từ học kỳ, đợt đăng ký (chỉ đọc,
  // sửa ở trang Học kỳ) để lịch không có hai nguồn ngày.
  source: "manual" | "term" | "registration";
};

// Loại mốc tự nhập: thời gian học kỳ và đợt đăng ký lấy từ học kỳ, đợt đăng ký.
export type ManualCalendarEventKind = Exclude<CalendarEventKind, "teaching" | "registration">;

export type RegulationVersion = {
  version: string;
  effectiveFrom: string;
  decision: string;
  summary: string;
};

export type ReportFormat = "xlsx" | "pdf" | "csv";

// Ô số kèm định dạng: Excel nhận giá trị số với định dạng hiển thị, CSV nhận chữ đã định dạng kiểu Việt Nam.
export type ReportCell = string | number | { value: number; text: string; numFmt: string };

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  audience: string;
  // Báo cáo theo học kỳ hay số liệu hiện tại (không chọn học kỳ).
  usesTerm: boolean;
  // Lọc theo khoa: khoa của sinh viên hay khoa quản lý học phần.
  facultyBasis: "student" | "course";
  // Quyền cần để xuất, tải (ngoài reports.view).
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
