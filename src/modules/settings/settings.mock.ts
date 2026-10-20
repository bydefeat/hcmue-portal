import { dayjs } from "@/shared/libs/date.lib";
import { mockDate, mockId, mockTermId } from "@/shared/libs/mock.lib";
import type { RegulationRules } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportFormat } from "@/modules/settings/settings.type";

export const REGULATION: RegulationSettings = {
  version: "2025.1",
  effectiveFrom: "2025-09-01",
  updatedAt: mockDate(-46, "15:20"),
  updatedBy: "Trần Minh Khoa",
  grading: {
    scale: [
      { letter: "A", min: 8.5, point4: 4 },
      { letter: "B+", min: 8, point4: 3.5 },
      { letter: "B", min: 7, point4: 3 },
      { letter: "C+", min: 6.5, point4: 2.5 },
      { letter: "C", min: 5.5, point4: 2 },
      { letter: "D+", min: 5, point4: 1.5 },
      { letter: "D", min: 4, point4: 1 },
      { letter: "F", min: 0, point4: 0 },
    ],
    roundingStep: 0.1,
    standing: { excellent: 3.6, veryGood: 3.2, good: 2.5, average: 2, weak: 1 },
  },
  credits: { minPerTerm: 14, maxPerTerm: 25, maxSummer: 12, maxWhenWarned: 14, overloadMinCpa: 2.5 },
  warning: { level1TermGpa: 1, level1FailedCredits: 6, level2Cpa: 1.5, level2FailedCredits: 12, level3Cpa: 1, expelAfterWarnings: 2 },
  attendance: { absenceLimitPercent: 20 },
  workflow: { gradeEntryDays: 10, gradeDueSoonDays: 5, studyPlanReviewDays: 5, regradeWindowDays: 7, registrationClosingSoonHours: 48 },
  graduation: { retakeLimitPercent: 5, downgradeDisciplineLevel: "warning", downgradeStandings: ["excellent", "very-good"], languageMinLevel: "B1", requireItCertificate: true },
};

// Tham số của bản quy chế đang áp dụng trong dữ liệu mẫu, seed và test dùng để tính điểm, cảnh báo như app.
export const REGULATION_RULES: RegulationRules = {
  grading: REGULATION.grading,
  credits: REGULATION.credits,
  warning: REGULATION.warning,
  attendance: REGULATION.attendance,
  workflow: REGULATION.workflow,
  graduation: REGULATION.graduation,
};

// Các bản quy chế cũ: 2023.1 chưa có hạn mức riêng cho sinh viên bị cảnh báo, 2021.1 chưa có điểm cộng (B+, C+, D+).
export const REGULATION_VERSIONS: (RegulationVersion & { id: string; rules: RegulationRules })[] = [
  { version: "2025.1", effectiveFrom: "2025-09-01", decision: "2150/QĐ-ĐHSP", summary: "Cảnh báo học vụ 3 mức, giới hạn 14 tín chỉ cho sinh viên bị cảnh báo." },
  { version: "2023.1", effectiveFrom: "2023-09-01", decision: "1980/QĐ-ĐHSP", summary: "Áp dụng thang điểm chữ có điểm cộng (B+, C+, D+)." },
  { version: "2021.1", effectiveFrom: "2021-09-01", decision: "1604/QĐ-ĐHSP", summary: "Quy chế đào tạo theo tín chỉ theo Thông tư 08/2021/TT-BGDĐT." },
].map((version) => {
  const { grading, credits } = REGULATION_RULES;
  const rules = { ...REGULATION_RULES };
  if (version.version === "2023.1") rules.credits = { ...credits, maxWhenWarned: credits.maxPerTerm };
  if (version.version === "2021.1") {
    rules.credits = { ...credits, maxWhenWarned: credits.maxPerTerm };
    rules.grading = { ...grading, scale: grading.scale.filter((step) => !step.letter.endsWith("+")) };
  }
  return { ...version, id: mockId(`regulation:${version.version}`), rules };
});

function range(termId: string, kind: CalendarEvent["kind"], title: string, start: string, end: string, audience = "Toàn trường"): CalendarEvent {
  return { id: mockId(`calendar:${termId}:${kind}:${start}`), termId, kind, title, startDate: start, endDate: end, audience };
}

const DAY = (offset: number) => dayjs().startOf("day").add(offset, "day").format("YYYY-MM-DD");

export const CALENDAR_EVENTS: CalendarEvent[] = [
  range(mockTermId("hk1-2026"), "registration", "Đăng ký học phần đợt 1, khóa 48 và 49", "2026-08-03", "2026-08-09", "Khóa 48, 49"),
  range(mockTermId("hk1-2026"), "registration", "Đăng ký học phần đợt 2, khóa 50 và 51", "2026-08-12", "2026-08-18", "Khóa 50, 51"),
  range(mockTermId("hk1-2026"), "teaching", "Tuần học 1 đến 15", "2026-09-07", "2026-12-20"),
  range(mockTermId("hk1-2026"), "registration", "Điều chỉnh đăng ký", "2026-09-07", "2026-09-13"),
  range(mockTermId("hk1-2026"), "holiday", "Nghỉ Quốc khánh", "2026-09-01", "2026-09-02"),
  range(mockTermId("hk1-2026"), "exam", "Thi giữa kỳ", DAY(-4), DAY(13)),
  range(mockTermId("hk1-2026"), "event", "Hội thảo nghiên cứu khoa học sinh viên", "2026-11-20", "2026-11-20"),
  range(mockTermId("hk1-2026"), "exam", "Thi cuối kỳ", "2027-01-04", "2027-01-16"),
  range(mockTermId("hk1-2026"), "grading", "Nhập điểm và chốt điểm", "2027-01-04", "2027-01-26", "Giảng viên"),
  range(mockTermId("hk1-2026"), "grading", "Công bố điểm học kỳ 1", "2027-01-30", "2027-01-30"),
  range(mockTermId("hk2-2026"), "registration", "Đăng ký học phần đợt 1, khóa 48 và 49", DAY(-4), DAY(1), "Khóa 48, 49"),
  range(mockTermId("hk2-2026"), "registration", "Đăng ký học phần đợt 2, khóa 50 và 51", DAY(-1), DAY(6), "Khóa 50, 51"),
  range(mockTermId("hk2-2026"), "holiday", "Nghỉ Tết Nguyên đán", "2027-02-01", "2027-02-14"),
  range(mockTermId("hk2-2026"), "teaching", "Tuần học 1 đến 15", "2027-02-22", "2027-06-06"),
  range(mockTermId("hk2-2026"), "holiday", "Nghỉ lễ 30/4 và 1/5", "2027-04-30", "2027-05-03"),
  range(mockTermId("hk2-2026"), "exam", "Thi cuối kỳ", "2027-06-07", "2027-06-26"),
];

// Lịch sử xuất báo cáo, do tài khoản Phòng Đào tạo seed tạo.
export const REPORT_EXPORTS: { id: string; reportKey: string; termId: string; faculty: string; format: ReportFormat; createdAt: string; rowCount: number }[] = [
  { id: mockId("report-export:job-2"), reportKey: "warnings", termId: mockTermId("hk2-2025"), faculty: "all", format: "csv", createdAt: mockDate(-1, "16:00"), rowCount: 27 },
  { id: mockId("report-export:job-1"), reportKey: "moet", termId: mockTermId("hk1-2026"), faculty: "all", format: "csv", createdAt: mockDate(-3, "09:00"), rowCount: 24 },
];
