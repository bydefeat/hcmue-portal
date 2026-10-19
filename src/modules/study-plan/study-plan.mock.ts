import { createRandom, mockDate, mockId, mockStudentIdentity } from "@/shared/libs/mock.lib";
import { TERMS_DONE_BY_COHORT } from "@/shared/libs/mock-course.lib";
import type { StudyPlanStatus } from "@/modules/study-plan/study-plan.type";

const PLAN_CLASSES = ["49.01.CNTT.A", "50.01.CNTT.A", "49.01.CNTT.B", "50.01.CNTT.B"];
const STUDENT_TOTAL = 600;

// Kế hoạch xếp cho các học kỳ sau học kỳ hiện tại (HK1 2026-2027).
export const STUDY_PLAN_TERMS = [
  { academicYear: 2026, semester: 2 },
  { academicYear: 2027, semester: 1 },
  { academicYear: 2027, semester: 2 },
];

const NOTES = [
  "Em muốn học Học máy sớm để kịp làm khóa luận theo hướng trí tuệ nhân tạo.",
  "Học kỳ này em đi làm thêm buổi tối nên chỉ đăng ký các lớp buổi sáng.",
  "Em xin học vượt một học phần vì đã đạt chứng chỉ tiếng Anh B2.",
  "Em xếp các học phần chuyên ngành vào học kỳ 2 để học kỳ sau đi thực tập trọn thời gian.",
  "",
];

function statusFor(roll: number): StudyPlanStatus {
  if (roll < 0.42) return "pending";
  if (roll < 0.72) return "approved";
  if (roll < 0.84) return "returned";
  return "draft";
}

export type StudyPlanSeed = {
  id: string;
  studentId: string;
  majorCode: string;
  cohort: number;
  className: string;
  // Học kỳ của chương trình đào tạo ứng với học kỳ đầu tiên trong kế hoạch; học phần học kỳ sau xếp vào cột sau.
  firstProgramSemester: number;
  status: StudyPlanStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  studentNote: string;
  advisorComment: string | null;
};

// Học phần trong kế hoạch lấy từ khung chương trình đào tạo của sinh viên khi seed (module curriculum).
export const STUDY_PLANS: StudyPlanSeed[] = Array.from({ length: STUDENT_TOTAL }, (_, index) => mockStudentIdentity(index))
  .filter((student) => PLAN_CLASSES.includes(student.className))
  .map((student) => {
    const random = createRandom(student.index * 61 + 5);
    const status = statusFor(random());
    const submittedDaysAgo = 1 + Math.floor(random() * 10);
    return {
      id: mockId(`study-plan:${student.index}`),
      studentId: student.id,
      majorCode: student.majorCode,
      cohort: student.cohort,
      className: student.className,
      firstProgramSemester: (TERMS_DONE_BY_COHORT[student.cohort] ?? 0) + 2,
      status,
      submittedAt: status === "draft" ? null : mockDate(-submittedDaysAgo, `${8 + (student.index % 12)}:15`),
      reviewedAt: status === "approved" || status === "returned" ? mockDate(-Math.max(0, submittedDaysAgo - 2), "15:40") : null,
      studentNote: NOTES[student.index % NOTES.length],
      advisorComment:
        status === "returned"
          ? "Học kỳ 2 em đăng ký dưới 14 tín chỉ, bổ sung thêm một học phần tự chọn rồi nộp lại."
          : status === "approved"
            ? "Kế hoạch hợp lý."
            : null,
    };
  });
