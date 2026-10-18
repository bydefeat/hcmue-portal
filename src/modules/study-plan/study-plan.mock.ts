import { createRandom, mockDate, mockStudentIdentity } from "@/shared/libs/mock.lib";
import type { StudyPlan, StudyPlanCourse, StudyPlanStatus } from "./study-plan.type";

const PLAN_CLASSES = ["49.01.CNTT.A", "50.01.CNTT.A", "49.01.CNTT.B", "50.01.CNTT.B"];
const STUDENT_TOTAL = 600;

const COURSES_BY_COHORT: Record<number, StudyPlanCourse[][]> = {
  49: [
    [
      { code: "COMP1100", name: "Học máy", credits: 3 },
      { code: "COMP1120", name: "An toàn và bảo mật thông tin", credits: 3 },
      { code: "COMP1090", name: "Công nghệ phần mềm", credits: 3 },
      { code: "COMP1130", name: "Xử lý ngôn ngữ tự nhiên tiếng Việt", credits: 3 },
      { code: "POLI1005", name: "Tư tưởng Hồ Chí Minh", credits: 2 },
      { code: "EDUC1002", name: "Phương pháp nghiên cứu khoa học giáo dục", credits: 2 },
    ],
    [
      { code: "COMP4900", name: "Thực tập nghề nghiệp", credits: 4 },
      { code: "COMP1110", name: "Phát triển ứng dụng di động", credits: 3 },
      { code: "COMP1170", name: "Khai phá dữ liệu", credits: 3 },
    ],
  ],
  50: [
    [
      { code: "COMP1031", name: "Lập trình hướng đối tượng", credits: 3 },
      { code: "COMP1060", name: "Hệ điều hành", credits: 3 },
      { code: "COMP1040", name: "Cơ sở dữ liệu", credits: 3 },
      { code: "MATH1013", name: "Xác suất thống kê", credits: 3 },
      { code: "POLI1003", name: "Chủ nghĩa xã hội khoa học", credits: 2 },
      { code: "PSYC1001", name: "Tâm lý học giáo dục", credits: 3 },
    ],
    [
      { code: "COMP1070", name: "Phát triển ứng dụng web", credits: 3 },
      { code: "COMP1080", name: "Trí tuệ nhân tạo", credits: 3 },
      { code: "COMP1050", name: "Mạng máy tính", credits: 3 },
      { code: "POLI1004", name: "Lịch sử Đảng Cộng sản Việt Nam", credits: 2 },
    ],
  ],
};

const NOTES = [
  "Em muốn học Học máy sớm để kịp làm khóa luận theo hướng trí tuệ nhân tạo.",
  "Học kỳ này em đi làm thêm buổi tối nên chỉ đăng ký các lớp buổi sáng.",
  "Em xin học vượt một học phần vì đã đạt chứng chỉ tiếng Anh B2.",
  "Em đăng ký học lại Xác suất thống kê để cải thiện điểm.",
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
    const [nextTerm, laterTerm] = COURSES_BY_COHORT[student.cohort];
    const nextCourses = nextTerm.filter(() => random() > 0.18);
    const terms = [
      { termName: "Học kỳ 2, năm học 2026-2027", courses: nextCourses },
      { termName: "Học kỳ 1, năm học 2027-2028", courses: laterTerm },
    ];
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
