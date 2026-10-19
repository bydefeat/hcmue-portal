import { createRandom, mockDate, mockStudentIdentity } from "@/shared/libs/mock.lib";
import { mockCourseSequence, mockCoursesTaken } from "@/shared/libs/mock-course.lib";
import type { StudyPlan, StudyPlanCourse, StudyPlanStatus } from "./study-plan.type";

const PLAN_CLASSES = ["49.01.CNTT.A", "50.01.CNTT.A", "49.01.CNTT.B", "50.01.CNTT.B"];
const STUDENT_TOTAL = 600;
const COURSES_PER_PLANNED_TERM = 6;

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

export const STUDY_PLANS: StudyPlan[] = Array.from({ length: STUDENT_TOTAL }, (_, index) => mockStudentIdentity(index))
  .filter((student) => PLAN_CLASSES.includes(student.className))
  .map((student) => {
    const random = createRandom(student.index * 61 + 5);
    const status = statusFor(random());
    const remaining = mockCourseSequence(student.majorCode)
      .slice(mockCoursesTaken(student.cohort))
      .map(([code, name, credits]): StudyPlanCourse => ({ code, name, credits }));
    const nextCourses = remaining.slice(0, COURSES_PER_PLANNED_TERM).filter(() => random() > 0.18);
    const terms = [
      { termName: "Học kỳ 2, năm học 2026-2027", courses: nextCourses },
      { termName: "Học kỳ 1, năm học 2027-2028", courses: remaining.slice(COURSES_PER_PLANNED_TERM, COURSES_PER_PLANNED_TERM * 2) },
    ].filter((term) => term.courses.length > 0);
    const submittedDaysAgo = 1 + Math.floor(random() * 10);
    return {
      id: `khht-${student.index}`,
      studentId: student.id,
      studentCode: student.code,
      fullName: student.fullName,
      className: student.className,
      targetTermName: terms[0].termName,
      status,
      submittedAt: status === "draft" ? null : mockDate(-submittedDaysAgo, `${8 + (student.index % 12)}:15`),
      reviewedAt: status === "approved" || status === "returned" ? mockDate(-Math.max(0, submittedDaysAgo - 2), "15:40") : null,
      totalCredits: nextCourses.reduce((sum, course) => sum + course.credits, 0),
      terms,
      studentNote: NOTES[student.index % NOTES.length],
      advisorComment:
        status === "returned"
          ? "Học kỳ 2 em đăng ký dưới 14 tín chỉ, bổ sung thêm một học phần tự chọn rồi nộp lại."
          : status === "approved"
            ? "Kế hoạch hợp lý."
            : null,
    };
  });
