import { dayjs } from "@/shared/libs/date.lib";
import { mockDate, mockId, mockLecturerIdentity, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import type { ExamFormat, ExamPaperStatus, ExamSession } from "@/modules/exams/exams.type";

type Seed = [sectionId: string, code: string, courseName: string, lecturerIndex: number | null, candidates: number, faculty: string, format: ExamFormat];

const IT = "Khoa Công nghệ Thông tin";

const SECTIONS: Seed[] = [
  [mockSectionId("hk1-2026", "COMP1020.01"), "COMP1020.01", "Cấu trúc dữ liệu và giải thuật", 0, 42, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1020.02"), "COMP1020.02", "Cấu trúc dữ liệu và giải thuật", 0, 38, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1070.01"), "COMP1070.01", "Phát triển ứng dụng web", 0, 40, IT, "project"],
  [mockSectionId("hk1-2026", "COMP1080.01"), "COMP1080.01", "Trí tuệ nhân tạo", 0, 47, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1010.01"), "COMP1010.01", "Lập trình cơ bản", 6, 49, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1010.02"), "COMP1010.02", "Lập trình cơ bản", 12, 44, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1031.01"), "COMP1031.01", "Lập trình hướng đối tượng", 18, 45, IT, "practical"],
  [mockSectionId("hk1-2026", "COMP1040.01"), "COMP1040.01", "Cơ sở dữ liệu", 6, 41, IT, "multiple-choice"],
  [mockSectionId("hk1-2026", "COMP1060.01"), "COMP1060.01", "Hệ điều hành", 12, 36, IT, "written"],
  [mockSectionId("hk1-2026", "COMP1090.01"), "COMP1090.01", "Công nghệ phần mềm", 18, 39, IT, "project"],
  [mockSectionId("hk1-2026", "MATH1011.01"), "MATH1011.01", "Giải tích 1", 1, 58, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "MATH1013.01"), "MATH1013.01", "Xác suất thống kê", 7, 52, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "MATH2001.01"), "MATH2001.01", "Giải tích 2", 13, 31, "Khoa Toán - Tin học", "written"],
  [mockSectionId("hk1-2026", "LITR1010.01"), "LITR1010.01", "Văn học Việt Nam hiện đại", 2, 47, "Khoa Ngữ văn", "written"],
  [mockSectionId("hk1-2026", "ENGL1002.01"), "ENGL1002.01", "Tiếng Anh 2", 3, 35, "Khoa Tiếng Anh", "oral"],
  [mockSectionId("hk1-2026", "PHYS1010.01"), "PHYS1010.01", "Điện và từ", 4, 34, "Khoa Vật lý", "written"],
  [mockSectionId("hk1-2026", "PSYC1001.01"), "PSYC1001.01", "Tâm lý học giáo dục", 5, 76, "Khoa Tâm lý học", "multiple-choice"],
  [mockSectionId("hk1-2026", "POLI1001.01"), "POLI1001.01", "Triết học Mác - Lênin", null, 118, "Khoa Lý luận chính trị", "multiple-choice"],
];

const ROOMS_FOR: Record<ExamFormat, string[]> = {
  written: ["A.201", "A.203", "B.302", "B.405", "H.2.04"],
  "multiple-choice": ["C.301 (Phòng máy)", "C.302 (Phòng máy)", "I.101 (Hội trường)"],
  practical: ["C.301 (Phòng máy)", "C.302 (Phòng máy)"],
  oral: ["H.3.11"],
  project: ["B.302", "A.305"],
};

const START_TIMES = ["06:30", "09:10", "12:30", "15:10"];
const PAPER_STATUSES: ExamPaperStatus[] = ["approved", "submitted", "not-submitted"];

// Đề cuối kỳ bị Phòng Khảo thí trả lại, giảng viên cần nộp lại.
const RETURNED: Record<string, string> = {
  "COMP1020.02": "Đáp án câu 3 chưa có thang điểm chi tiết; trang bìa đề thiếu thời gian làm bài và quy định được dùng tài liệu.",
};

const REVIEWER_NAME = "Trần Minh Khoa";

function proctorsFor(index: number, lecturerIndex: number | null) {
  const first = mockLecturerIdentity((index * 5 + 3) % 24);
  const second = mockLecturerIdentity((index * 7 + 1) % 24);
  const list = [first, second].filter((lecturer, position, all) => all.findIndex((entry) => entry.id === lecturer.id) === position && lecturer.index !== lecturerIndex);
  if (index === 11 || index === 4) list.unshift(mockLecturerIdentity(0));
  return list.slice(0, 2).map((lecturer) => ({ id: lecturer.id, name: lecturer.displayName }));
}

function build(seed: Seed, index: number, kind: "midterm" | "final"): ExamSession {
  const [sectionId, code, courseName, lecturerIndex, candidates, faculty, format] = seed;
  const lecturer = lecturerIndex === null ? null : mockLecturerIdentity(lecturerIndex);
  const rooms = ROOMS_FOR[format];
  const date = kind === "midterm" ? mockDate(-4 + index, "00:00") : dayjs("2027-01-04").add(index % 10, "day").toISOString();
  const isPast = dayjs(date).isBefore(dayjs().startOf("day"));
  const returnReason = kind === "final" ? (RETURNED[code] ?? null) : null;
  const paperStatus: ExamPaperStatus = returnReason ? "returned" : kind === "midterm" ? (isPast ? "approved" : PAPER_STATUSES[index % 2]) : PAPER_STATUSES[index % 3];
  // Đề đã nộp có tệp đề và đáp án; seed ghi tệp PDF mẫu và lưu kích thước, thời điểm nộp thật.
  const fileStem = `${kind === "midterm" ? "giua-ky" : "cuoi-ky"}-${code}`;
  const papers =
    paperStatus === "not-submitted"
      ? []
      : [
          { kind: "paper" as const, fileName: `De thi ${fileStem}.pdf`, sizeBytes: 0 },
          { kind: "answer-key" as const, fileName: `Dap an ${fileStem}.pdf`, sizeBytes: 0 },
        ];
  return {
    id: mockId(`exam-session:thi-${kind}-${code.toLowerCase()}`),
    termId: mockTermId("hk1-2026"),
    kind,
    classSectionId: sectionId,
    classCode: code,
    courseName,
    lecturerId: lecturer?.id ?? null,
    lecturerName: lecturer?.displayName ?? null,
    faculty,
    date: dayjs(date).format("YYYY-MM-DD"),
    startTime: START_TIMES[index % START_TIMES.length],
    durationMinutes: format === "oral" ? 240 : format === "project" ? 180 : kind === "midterm" ? 60 : 90,
    room: rooms[index % rooms.length],
    format,
    candidateCount: candidates,
    proctors: proctorsFor(index + (kind === "final" ? 3 : 0), lecturerIndex),
    status: kind === "final" ? (index % 4 === 0 ? "draft" : "published") : isPast ? "done" : "published",
    paperStatus,
    paperDeadline: kind === "midterm" ? dayjs(date).subtract(5, "day").toISOString() : mockDate(5 + (index % 4), "17:00"),
    paperSubmittedAt: null,
    papers,
    // Thời điểm xét thật do seed tính theo lúc nộp; ở đây chỉ giữ người xét và lý do.
    paperReview: paperStatus === "approved" || paperStatus === "returned" ? { reviewerName: REVIEWER_NAME, reviewedAt: "", returnReason } : null,
    swapRequests: [],
  };
}

export const EXAM_SESSIONS: ExamSession[] = [
  ...SECTIONS.map((seed, index) => build(seed, index, "midterm")),
  ...SECTIONS.map((seed, index) => build(seed, index, "final")),
];
