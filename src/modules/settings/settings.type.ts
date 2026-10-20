import type { Permission } from "@/modules/access/access.type";

export type LetterStep = {
  letter: string;
  min: number;
  point4: number;
};

// Ngưỡng CPA (thang 4) thấp nhất của từng mức xếp loại học lực; dùng cho cả xếp loại tốt nghiệp (mức Trung bình trở lên mới tốt nghiệp).
export type StandingThresholds = {
  excellent: number;
  veryGood: number;
  good: number;
  average: number;
  weak: number;
};

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

// Mức kỷ luật sinh viên từ nhẹ đến nặng.
export type DisciplineLevel = "reprimand" | "warning" | "suspension" | "expulsion";

export type RankedStanding = "excellent" | "very-good" | "good" | "average";

export type RegulationSettings = {
  version: string;
  effectiveFrom: string;
  updatedAt: string;
  updatedBy: string;
  grading: {
    scale: LetterStep[];
    // Bước làm tròn điểm tổng kết học phần (thang 10): 0,1, 0,5 hoặc 1.
    roundingStep: 0.1 | 0.5 | 1;
    standing: StandingThresholds;
  };
  credits: {
    minPerTerm: number;
    maxPerTerm: number;
    maxSummer: number;
    maxWhenWarned: number;
    overloadMinCpa: number;
    // Học vượt được duyệt đăng ký tối đa maxPerTerm cộng số tín chỉ này.
    overloadExtraCredits: number;
  };
  warning: {
    level1TermGpa: number;
    level1FailedCredits: number;
    level2Cpa: number;
    level2FailedCredits: number;
    level3Cpa: number;
    // Số học kỳ chính liên tiếp bị cảnh báo thì đưa vào danh sách đề xuất xét buộc thôi học.
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
    // Tổng số học kỳ bảo lưu tối đa trong thời gian học (kiểm khi gửi đơn và khi duyệt đơn bảo lưu).
    maxReserveTerms: number;
  };
  graduation: {
    // Khối lượng học lại vượt quá phần trăm này của tổng tín chỉ chương trình thì hạng tốt nghiệp bị giảm một mức.
    retakeLimitPercent: number;
    // Bị kỷ luật từ mức này trở lên trong thời gian học thì hạng tốt nghiệp bị giảm một mức.
    downgradeDisciplineLevel: DisciplineLevel;
    // Các hạng bị giảm khi vi phạm một trong hai điều kiện trên (thông lệ: Xuất sắc, Giỏi).
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
