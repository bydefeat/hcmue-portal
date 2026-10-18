import { dayjs } from "@/shared/libs/date.lib";
import { mockDate } from "@/shared/libs/mock.lib";
import type { CalendarEvent, RegulationSettings, RegulationVersion } from "./settings.type";

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
    passScore: 4,
    roundingStep: 0.1,
  },
  credits: { minPerTerm: 14, maxPerTerm: 25, maxSummer: 12, maxWhenWarned: 14, overloadMinCpa: 2.5 },
  warning: { level1TermGpa: 1, level1FailedCredits: 6, level2Cpa: 1.5, level2FailedCredits: 12, level3Cpa: 1 },
  attendance: { absenceLimitPercent: 20 },
  workflow: { gradeEntryDays: 10, gradeDueSoonDays: 5, studyPlanReviewDays: 5, regradeWindowDays: 7, registrationClosingSoonHours: 48 },
};

export const REGULATION_VERSIONS: RegulationVersion[] = [
  { version: "2025.1", effectiveFrom: "2025-09-01", decision: "2150/QĐ-ĐHSP", summary: "Cảnh báo học vụ 3 mức, giới hạn 14 tín chỉ cho sinh viên bị cảnh báo." },
  { version: "2023.1", effectiveFrom: "2023-09-01", decision: "1980/QĐ-ĐHSP", summary: "Áp dụng thang điểm chữ có điểm cộng (B+, C+, D+)." },
  { version: "2021.1", effectiveFrom: "2021-09-01", decision: "1604/QĐ-ĐHSP", summary: "Quy chế đào tạo theo tín chỉ theo Thông tư 08/2021/TT-BGDĐT." },
];

function range(termId: string, kind: CalendarEvent["kind"], title: string, start: string, end: string, audience = "Toàn trường"): CalendarEvent {
  return { id: `${termId}-${kind}-${start}`, termId, kind, title, startDate: start, endDate: end, audience };
}

const DAY = (offset: number) => dayjs().startOf("day").add(offset, "day").format("YYYY-MM-DD");

export const CALENDAR_EVENTS: CalendarEvent[] = [
  range("hk1-2026", "registration", "Đăng ký học phần đợt 1, khóa 48 và 49", "2026-08-03", "2026-08-09", "Khóa 48, 49"),
  range("hk1-2026", "registration", "Đăng ký học phần đợt 2, khóa 50 và 51", "2026-08-12", "2026-08-18", "Khóa 50, 51"),
  range("hk1-2026", "teaching", "Tuần học 1 đến 15", "2026-09-07", "2026-12-20"),
  range("hk1-2026", "registration", "Điều chỉnh đăng ký", "2026-09-07", "2026-09-13"),
  range("hk1-2026", "holiday", "Nghỉ Quốc khánh", "2026-09-01", "2026-09-02"),
  range("hk1-2026", "exam", "Thi giữa kỳ", DAY(-4), DAY(13)),
  range("hk1-2026", "event", "Hội thảo nghiên cứu khoa học sinh viên", "2026-11-20", "2026-11-20"),
  range("hk1-2026", "exam", "Thi cuối kỳ", "2027-01-04", "2027-01-16"),
  range("hk1-2026", "grading", "Nhập điểm và chốt điểm", "2027-01-04", "2027-01-26", "Giảng viên"),
  range("hk1-2026", "grading", "Công bố điểm học kỳ 1", "2027-01-30", "2027-01-30"),
  range("hk2-2026", "registration", "Đăng ký học phần đợt 1, khóa 48 và 49", DAY(-4), DAY(1), "Khóa 48, 49"),
  range("hk2-2026", "registration", "Đăng ký học phần đợt 2, khóa 50 và 51", DAY(5), DAY(11), "Khóa 50, 51"),
  range("hk2-2026", "holiday", "Nghỉ Tết Nguyên đán", "2027-02-01", "2027-02-14"),
  range("hk2-2026", "teaching", "Tuần học 1 đến 15", "2027-02-22", "2027-06-06"),
  range("hk2-2026", "holiday", "Nghỉ lễ 30/4 và 1/5", "2027-04-30", "2027-05-03"),
  range("hk2-2026", "exam", "Thi cuối kỳ", "2027-06-07", "2027-06-26"),
];
