import { z } from "zod";
import { DEGREE_OPTIONS } from "@/modules/curriculum/curriculum.constant";
import type { Course, FrameworkIssue, ProgramCourseChange, ProgramDetail, ProgramStatus } from "@/modules/curriculum/curriculum.type";

const COURSE_CODE = /^[A-Z]{4}\d{4}$/;
const DEGREES = DEGREE_OPTIONS.map((option) => option.value) as [string, ...string[]];

const courseCodes = z
  .array(z.string().regex(COURSE_CODE, "Mã học phần không hợp lệ"))
  .max(20, "Tối đa 20 học phần")
  .transform((codes) => [...new Set(codes)]);

// Dùng chung cho form và server action; DB còn chặn thêm bằng courses_credit_split, course_relations_not_self.
export const COURSE_SCHEMA = z
  .object({
    code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(COURSE_CODE, "Mã gồm 4 chữ cái và 4 chữ số, ví dụ COMP1020")),
    name: z.string().trim().min(1, "Chưa nhập tên học phần").max(200, "Tối đa 200 ký tự"),
    credits: z.int("Chưa nhập").min(1, "Ít nhất 1 tín chỉ").max(10, "Tối đa 10 tín chỉ"),
    theoryCredits: z.int("Chưa nhập").min(0).max(10),
    practiceCredits: z.int("Chưa nhập").min(0).max(10),
    faculty: z.string().trim().min(1, "Chưa chọn khoa"),
    type: z.enum(["required", "elective"]),
    block: z.enum(["general", "foundation", "major", "internship"]),
    prerequisiteCodes: courseCodes,
    corequisiteCodes: courseCodes,
    equivalentCodes: courseCodes,
    description: z.string().trim().max(2000, "Tối đa 2000 ký tự").default(""),
    isActive: z.boolean(),
  })
  .refine((course) => course.theoryCredits + course.practiceCredits === course.credits, {
    path: ["practiceCredits"],
    message: "Lý thuyết cộng thực hành phải bằng số tín chỉ",
  })
  .refine((course) => ![...course.prerequisiteCodes, ...course.corequisiteCodes, ...course.equivalentCodes].includes(course.code), {
    path: ["prerequisiteCodes"],
    message: "Học phần không thể liên quan tới chính nó",
  });

export type CourseInput = z.input<typeof COURSE_SCHEMA>;

export const PROGRAM_SCHEMA = z.object({
  code: z.string().trim().regex(/^\d{7}$/, "Mã ngành gồm 7 chữ số theo danh mục của Bộ"),
  name: z.string().trim().min(1, "Chưa nhập tên chương trình").max(200, "Tối đa 200 ký tự"),
  majorCode: z.string().trim().min(1, "Chưa chọn ngành"),
  degree: z.enum(DEGREES, "Chưa chọn văn bằng"),
  totalCredits: z.int("Chưa nhập tổng tín chỉ").min(60, "Ít nhất 60 tín chỉ").max(200, "Tối đa 200 tín chỉ"),
  durationYears: z.int("Thời gian đào tạo tính theo năm").min(1).max(8),
  cohorts: z
    .array(z.int().min(1).max(99))
    .min(1, "Chọn ít nhất một khóa")
    .transform((cohorts) => [...new Set(cohorts)].toSorted((a, b) => a - b)),
  status: z.enum(["active", "draft", "archived"]),
});

export type ProgramInput = z.input<typeof PROGRAM_SCHEMA>;

// Khung chỉ xếp hai học kỳ chính mỗi năm. Mô hình khung (program_courses) không có học kỳ hè: học kỳ hè dùng để học lại,
// học vượt nên không cộng thêm. DB giới hạn tối đa 12 học kỳ và không vượt số năm đào tạo × 2.
export const PROGRAM_MAX_SEMESTER = 12;

export function programSemesterLimit(durationYears: number) {
  return Math.min(PROGRAM_MAX_SEMESTER, durationYears * 2);
}

// Chương trình đã ngừng áp dụng là trạng thái cuối: không mở lại (sinh viên khóa cũ đã xét theo khung đó). Muốn dùng lại thì tạo
// chương trình mới. DB chặn thêm bằng trigger programs_archived_final.
export function programStatusChangeError(from: ProgramStatus, to: ProgramStatus) {
  if (from === "archived" && to !== "archived") return "Chương trình đã ngừng áp dụng, không mở lại được. Tạo chương trình mới nếu cần áp dụng lại.";
  return null;
}

// Chương trình ngừng áp dụng chỉ xem; DB chặn thêm bằng trigger program_courses_program_archived.
export function isProgramEditable(status: ProgramStatus) {
  return status !== "archived";
}

const frameworkCourseCode = z.string().trim().regex(COURSE_CODE, "Mã học phần không hợp lệ");
const frameworkSemester = z.int("Chọn học kỳ").min(1, "Học kỳ từ 1").max(PROGRAM_MAX_SEMESTER, `Tối đa ${PROGRAM_MAX_SEMESTER} học kỳ`);

export const PROGRAM_COURSE_CHANGE_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add"),
    semester: frameworkSemester,
    courseCodes: z
      .array(frameworkCourseCode)
      .min(1, "Chọn ít nhất một học phần")
      .max(20, "Thêm tối đa 20 học phần mỗi lần")
      .transform((codes) => [...new Set(codes)]),
  }),
  z.object({ kind: z.literal("remove"), courseCode: frameworkCourseCode }),
  z.object({ kind: z.literal("move"), courseCode: frameworkCourseCode, semester: frameworkSemester }),
]);

export type ProgramCourseChangeInput = z.input<typeof PROGRAM_COURSE_CHANGE_SCHEMA>;

export type FrameworkPlanEntry = { courseCode: string; semester: number };

// Kiểm một thay đổi trên khung đang có, trả câu lỗi hoặc null. Server gọi lại trong giao dịch với dữ liệu mới nhất.
export function frameworkChangeError(
  plan: FrameworkPlanEntry[],
  change: ProgramCourseChange,
  catalog: Map<string, Pick<Course, "code" | "isActive">>,
  semesterLimit: number,
): string | null {
  const semesterOf = new Map(plan.map((entry) => [entry.courseCode, entry.semester]));
  if (change.kind !== "remove" && (change.semester < 1 || change.semester > semesterLimit)) {
    return `Khung chương trình này chỉ có học kỳ 1 đến ${semesterLimit}.`;
  }
  if (change.kind === "add") {
    for (const code of change.courseCodes) {
      const course = catalog.get(code);
      if (!course) return `Không có học phần ${code} trong danh mục.`;
      if (!course.isActive) return `Học phần ${code} đã ngừng mở, không thêm vào khung được.`;
      const existing = semesterOf.get(code);
      if (existing !== undefined) return `Học phần ${code} đã có trong khung ở học kỳ ${existing}.`;
    }
    return null;
  }
  const current = semesterOf.get(change.courseCode);
  if (current === undefined) return `Học phần ${change.courseCode} không còn trong khung, tải lại trang.`;
  if (change.kind === "move" && current === change.semester) return `Học phần ${change.courseCode} đã ở học kỳ ${current}.`;
  return null;
}

export function applyFrameworkChange(plan: FrameworkPlanEntry[], change: ProgramCourseChange): FrameworkPlanEntry[] {
  if (change.kind === "add") return [...plan, ...change.courseCodes.map((courseCode) => ({ courseCode, semester: change.semester }))];
  if (change.kind === "remove") return plan.filter((entry) => entry.courseCode !== change.courseCode);
  return plan.map((entry) => (entry.courseCode === change.courseCode ? { ...entry, semester: change.semester } : entry));
}

// Điểm cần xem lại của khung, chỉ cảnh báo chứ không chặn lưu: tiên quyết phải xếp ở học kỳ trước, học phần ngừng mở,
// tổng tín chỉ so với tổng của chương trình.
export function frameworkIssues(program: Pick<ProgramDetail, "semesters" | "totalCredits" | "plannedCredits">): FrameworkIssue[] {
  const semesterOf = new Map(program.semesters.flatMap((semester) => semester.courses.map((course) => [course.code, semester.semester] as const)));
  const issues: FrameworkIssue[] = [];
  for (const semester of program.semesters) {
    for (const course of semester.courses) {
      if (!course.isActive) issues.push({ kind: "inactive-course", courseCode: course.code, message: `${course.code} đã ngừng mở, sinh viên không đăng ký được.` });
      for (const prerequisite of course.prerequisiteCodes) {
        const at = semesterOf.get(prerequisite);
        if (at === undefined) {
          issues.push({
            kind: "prerequisite-missing",
            courseCode: course.code,
            message: `${course.code} cần học trước ${prerequisite}, nhưng ${prerequisite} chưa có trong khung.`,
          });
        } else if (at >= semester.semester) {
          issues.push({
            kind: "prerequisite-order",
            courseCode: course.code,
            message: `${course.code} ở học kỳ ${semester.semester} nhưng tiên quyết ${prerequisite} ở học kỳ ${at}, nên xếp ${course.code} sau.`,
          });
        }
      }
    }
  }
  const difference = program.plannedCredits - program.totalCredits;
  if (difference < 0) {
    issues.push({ kind: "credits-short", courseCode: null, message: `Khung còn thiếu ${-difference} tín chỉ so với tổng ${program.totalCredits} của chương trình.` });
  }
  if (difference > 0) {
    issues.push({ kind: "credits-over", courseCode: null, message: `Khung nhiều hơn tổng ${program.totalCredits} tín chỉ của chương trình ${difference} tín chỉ.` });
  }
  return issues;
}
