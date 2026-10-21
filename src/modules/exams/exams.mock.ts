import { dayjs } from "@/shared/libs/date.lib";
import { mockDate, mockId, mockLecturerIdentity, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { EXAM_START_TIMES } from "@/modules/exams/exams.constant";
import type { ExamFormat, ExamKind, ExamPaperFile, ExamPaperStatus, ExamSessionStatus } from "@/modules/exams/exams.type";

export type ExamSeed = {
  id: string;
  termId: string;
  kind: ExamKind;
  makeupOfId: string | null;
  classSectionId: string;
  classCode: string;
  courseName: string;
  lecturerId: string | null;
  faculty: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  format: ExamFormat;
  preferredRooms: string[];
  status: ExamSessionStatus;
  paperStatus: ExamPaperStatus;
  paperDeadline: string;
  papers: ExamPaperFile[];
  paperReview: { reviewerName: string; returnReason: string | null } | null;
  featureCurrentLecturer: boolean;
};

type Seed = [sectionId: string, code: string, courseName: string, lecturerIndex: number | null, faculty: string, format: ExamFormat];

const IT = "Khoa Công nghệ Thông tin";

const SECTIONS: Seed[] = [
  [mockSectionId("hk1-2026", "COMP1020.01"), "COMP1020.01", "Cấu trúc dữ liệu và giải thuật", 0, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1020.02"), "COMP1020.02", "Cấu trúc dữ liệu và giải thuật", 0, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1070.01"), "COMP1070.01", "Phát triển ứng dụng web", 0, IT, "project"],
  [mockSectionId("hk1-2026", "COMP1080.01"), "COMP1080.01", "Trí tuệ nhân tạo", 0, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1010.01"), "COMP1010.01", "Lập trình cơ bản", 6, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1010.02"), "COMP1010.02", "Lập trình cơ bản", 12, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1031.01"), "COMP1031.01", "Lập trình hướng đối tượng", 18, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1040.01"), "COMP1040.01", "Cơ sở dữ liệu", 6, IT, "multiple-choice"],
  [mockSectionId("hk1-2026", "COMP1060.01"), "COMP1060.01", "Hệ điều hành", 12, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1090.01"), "COMP1090.01", "Công nghệ phần mềm", 18, IT, "project"],
  [mockSectionId("hk1-2026", "MATH1011.01"), "MATH1011.01", "Giải tích 1", 1, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "MATH1013.01"), "MATH1013.01", "Xác suất thống kê", 7, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "MATH2001.01"), "MATH2001.01", "Giải tích 2", 13, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "LITR1010.01"), "LITR1010.01", "Văn học Việt Nam hiện đại", 2, "Khoa Ngữ văn", "written"],
  [mockSectionId("hk1-2026", "ENGL1002.01"), "ENGL1002.01", "Tiếng Anh 2", 3, "Khoa Tiếng Anh", "oral"],
  [mockSectionId("hk1-2026", "PHYS1010.01"), "PHYS1010.01", "Điện và từ", 4, "Khoa Vật lý", "written"],
  [mockSectionId("hk1-2026", "PSYC1001.01"), "PSYC1001.01", "Tâm lý học giáo dục", 5, "Khoa Tâm lý học", "multiple-choice"],
  [mockSectionId("hk1-2026", "POLI1001.01"), "POLI1001.01", "Triết học Mác - Lênin", null, "Khoa Lý luận chính trị", "multiple-choice"],
];

const PROJECT_GRADED = new Set(["COMP1070.01", "COMP1031.01"]);

const EARLY_FINISH = new Set(["MATH1011.01"]);

const ROOMS_FOR: Record<ExamFormat, string[]> = {
  written: ["A.201", "A.203", "B.302", "H.2.04", "B.405", "LA.105"],
  "multiple-choice": ["C.301 (Phòng máy)", "C.302 (Phòng máy)", "I.101 (Hội trường)"],
  practical: ["C.301 (Phòng máy)", "C.302 (Phòng máy)"],
  oral: ["H.3.11", "A.305"],
  project: ["B.302", "A.305"],
};

const START_TIMES = EXAM_START_TIMES.slice(0, 4);
const PAPER_STATUSES: ExamPaperStatus[] = ["approved", "submitted", "not-submitted"];

const RETURNED: Record<string, string> = {
  "COMP1020.02": "Đáp án câu 3 chưa có thang điểm chi tiết; trang bìa đề thiếu thời gian làm bài và quy định được dùng tài liệu.",
};

const REVIEWER_NAME = "Trần Minh Khoa";

function workday(date: dayjs.Dayjs) {
  return date.day() === 0 ? date.add(1, "day") : date;
}

const FINAL_DAYS = Array.from({ length: 12 }, (_, index) => dayjs("2027-01-04").add(index, "day"))
  .filter((day) => day.day() !== 0)
  .slice(0, 10);

function build(seed: Seed, index: number, kind: "midterm" | "final"): ExamSeed {
  const [sectionId, code, courseName, lecturerIndex, faculty, format] = seed;
  const lecturer = lecturerIndex === null ? null : mockLecturerIdentity(lecturerIndex);
  const early = EARLY_FINISH.has(code);
  const day =
    kind === "midterm"
      ? workday(dayjs(mockDate(early ? -35 : -4 + index, "00:00")))
      : early
        ? workday(dayjs(mockDate(-7, "00:00")))
        : FINAL_DAYS[index % FINAL_DAYS.length];
  const startTime = START_TIMES[index % START_TIMES.length];
  const durationMinutes = format === "oral" ? 240 : format === "project" ? 180 : kind === "midterm" ? 60 : 90;
  const startsAt = dayjs(`${day.format("YYYY-MM-DD")}T${startTime}`);
  const isPast = !startsAt.add(durationMinutes, "minute").isAfter(dayjs());
  const returnReason = kind === "final" && !isPast ? (RETURNED[code] ?? null) : null;
  const paperStatus: ExamPaperStatus = returnReason ? "returned" : isPast ? "approved" : kind === "midterm" ? PAPER_STATUSES[index % 2] : PAPER_STATUSES[index % 3];
  const fileStem = `${kind === "midterm" ? "giua-ky" : "cuoi-ky"}-${code}`;
  const papers: ExamPaperFile[] =
    paperStatus === "not-submitted"
      ? []
      : [
          { kind: "paper", fileName: `De thi ${fileStem}.pdf`, sizeBytes: 0 },
          { kind: "answer-key", fileName: `Dap an ${fileStem}.pdf`, sizeBytes: 0 },
        ];
  const paperDeadline = kind === "midterm" || early ? startsAt.subtract(5, "day").hour(17).minute(0).toISOString() : mockDate(5 + (index % 4), "17:00");
  return {
    id: mockId(`exam-session:thi-${kind}-${code.toLowerCase()}`),
    termId: mockTermId("hk1-2026"),
    kind,
    makeupOfId: null,
    classSectionId: sectionId,
    classCode: code,
    courseName,
    lecturerId: lecturer?.id ?? null,
    faculty,
    date: day.format("YYYY-MM-DD"),
    startTime,
    durationMinutes,
    format,
    preferredRooms: ROOMS_FOR[format],
    status: isPast ? "done" : kind === "final" && index % 4 === 0 ? "draft" : "published",
    paperStatus,
    paperDeadline,
    papers,
    paperReview: paperStatus === "approved" || paperStatus === "returned" ? { reviewerName: REVIEWER_NAME, returnReason } : null,
    featureCurrentLecturer: (kind === "midterm" && (index === 4 || index === 11)) || (kind === "final" && index === 7),
  };
}

const MIDTERMS = SECTIONS.flatMap((seed, index) => (PROJECT_GRADED.has(seed[1]) ? [] : [build(seed, index, "midterm")]));
const FINALS = SECTIONS.map((seed, index) => build(seed, index, "final"));

const MAKEUP_BASE = MIDTERMS.find((exam) => exam.classCode === "COMP1020.01")!;
const MAKEUP: ExamSeed = {
  ...MAKEUP_BASE,
  id: mockId("exam-session:thi-bu-giua-ky-comp1020.01"),
  kind: "makeup",
  makeupOfId: MAKEUP_BASE.id,
  date: workday(dayjs(mockDate(12, "00:00"))).format("YYYY-MM-DD"),
  startTime: "17:30",
  status: "draft",
  paperStatus: "not-submitted",
  paperDeadline: mockDate(9, "17:00"),
  papers: [],
  paperReview: null,
  preferredRooms: ["H.3.11"],
  featureCurrentLecturer: false,
};

export const EXAM_SESSIONS: ExamSeed[] = [...MIDTERMS, ...FINALS, MAKEUP];

export const EXAM_DEFERRAL_SEED = {
  id: mockId("exam-deferral:comp1020.01-midterm"),
  classSectionId: MAKEUP_BASE.classSectionId,
  rosterIndex: 3,
  kind: "midterm" as const,
  reason: "Nằm viện ngày thi, có giấy ra viện của Bệnh viện Chợ Rẫy",
  makeupSessionId: MAKEUP.id,
};

export const EXAM_SWAP_SEED = {
  id: mockId("exam-swap:gv0"),
  reason: "Trùng lịch họp hội đồng chấm luận văn của khoa",
};
