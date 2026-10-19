import { z } from "zod";
import { DEGREE_OPTIONS } from "@/modules/curriculum/curriculum.constant";

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
