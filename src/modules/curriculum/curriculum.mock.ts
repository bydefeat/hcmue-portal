import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { mockCourseSequence } from "@/shared/libs/mock-course.lib";
import type { Course, CourseType, KnowledgeBlock, Program, ProgramCourse } from "@/modules/curriculum/curriculum.type";

type CourseSeed = [code: string, name: string, credits: number, faculty: string, type: CourseType, block: KnowledgeBlock, prerequisites?: string[]];

const POLITICS = "Khoa Lý luận chính trị";
const EDUCATION = "Khoa Khoa học Giáo dục";
const IT = "Khoa Công nghệ Thông tin";
const MATH = "Khoa Toán - Tin học";
const LITERATURE = "Khoa Ngữ văn";
const ENGLISH = "Khoa Tiếng Anh";
const PHYSICS = "Khoa Vật lý";
const PSYCHOLOGY = "Khoa Tâm lý học";

export const CONDITIONAL_COURSE_CODES = ["PHYE1001", "PHYE1002", "DEFE1001"] as const;

const CONDITIONAL_SEEDS: CourseSeed[] = [
  ["PHYE1001", "Giáo dục thể chất 1", 1, EDUCATION, "required", "general"],
  ["PHYE1002", "Giáo dục thể chất 2", 1, EDUCATION, "required", "general", ["PHYE1001"]],
  ["DEFE1001", "Giáo dục quốc phòng và an ninh", 8, EDUCATION, "required", "general"],
];

const COURSE_SEEDS: CourseSeed[] = [
  ["POLI1001", "Triết học Mác - Lênin", 3, POLITICS, "required", "general"],
  ["POLI1002", "Kinh tế chính trị Mác - Lênin", 2, POLITICS, "required", "general", ["POLI1001"]],
  ["POLI1003", "Chủ nghĩa xã hội khoa học", 2, POLITICS, "required", "general", ["POLI1002"]],
  ["POLI1004", "Lịch sử Đảng Cộng sản Việt Nam", 2, POLITICS, "required", "general", ["POLI1003"]],
  ["POLI1005", "Tư tưởng Hồ Chí Minh", 2, POLITICS, "required", "general", ["POLI1003"]],
  ["ENGL1001", "Tiếng Anh 1", 3, ENGLISH, "required", "general"],
  ["ENGL1002", "Tiếng Anh 2", 3, ENGLISH, "required", "general", ["ENGL1001"]],
  ["PSYC1001", "Tâm lý học giáo dục", 3, PSYCHOLOGY, "required", "general"],
  ["EDUC1001", "Giáo dục học đại cương", 2, EDUCATION, "required", "general"],
  ["EDUC1002", "Phương pháp nghiên cứu khoa học giáo dục", 2, EDUCATION, "elective", "general"],
  ["MATH1011", "Giải tích 1", 3, MATH, "required", "foundation"],
  ["MATH1012", "Đại số tuyến tính", 3, MATH, "required", "foundation"],
  ["MATH1013", "Xác suất thống kê", 3, MATH, "required", "foundation", ["MATH1011"]],
  ["MATH1020", "Toán rời rạc", 3, MATH, "required", "foundation"],
  ["MATH2001", "Giải tích 2", 3, MATH, "required", "major", ["MATH1011"]],
  ["MATH2010", "Hình học sơ cấp", 3, MATH, "required", "major"],
  ["MATH2020", "Phương pháp dạy học môn Toán", 3, MATH, "required", "major", ["PSYC1001", "EDUC1001"]],
  ["COMP1010", "Lập trình cơ bản", 3, IT, "required", "foundation"],
  ["COMP1013", "Nhập môn công nghệ thông tin", 2, IT, "required", "foundation"],
  ["COMP1020", "Cấu trúc dữ liệu và giải thuật", 3, IT, "required", "foundation", ["COMP1010"]],
  ["COMP1031", "Lập trình hướng đối tượng", 3, IT, "required", "foundation", ["COMP1010"]],
  ["COMP1040", "Cơ sở dữ liệu", 3, IT, "required", "foundation"],
  ["COMP1050", "Mạng máy tính", 3, IT, "required", "major"],
  ["COMP1060", "Hệ điều hành", 3, IT, "required", "major", ["COMP1020"]],
  ["COMP1070", "Phát triển ứng dụng web", 3, IT, "required", "major", ["COMP1031", "COMP1040"]],
  ["COMP1080", "Trí tuệ nhân tạo", 3, IT, "required", "major", ["COMP1020", "MATH1013"]],
  ["COMP1090", "Công nghệ phần mềm", 3, IT, "required", "major", ["COMP1031"]],
  ["COMP1100", "Học máy", 3, IT, "elective", "major", ["COMP1080"]],
  ["COMP1110", "Phát triển ứng dụng di động", 3, IT, "elective", "major", ["COMP1031"]],
  ["COMP1120", "An toàn và bảo mật thông tin", 3, IT, "elective", "major", ["COMP1050"]],
  ["COMP1121", "Thực hành an toàn thông tin", 1, IT, "elective", "major"],
  ["MATH1014", "Xác suất thống kê ứng dụng (chương trình 2019)", 3, MATH, "required", "foundation", ["MATH1011"]],
  ["COMP1130", "Xử lý ngôn ngữ tự nhiên tiếng Việt", 3, IT, "elective", "major", ["COMP1100"]],
  ["COMP4900", "Thực tập nghề nghiệp", 4, IT, "required", "internship", ["COMP1070"]],
  ["COMP4990", "Khóa luận tốt nghiệp", 7, IT, "elective", "internship", ["COMP4900"]],
  ["LITR1001", "Dẫn luận ngôn ngữ học", 2, LITERATURE, "required", "foundation"],
  ["LITR1010", "Văn học Việt Nam hiện đại", 3, LITERATURE, "required", "major"],
  ["LITR1020", "Lý luận văn học", 3, LITERATURE, "required", "major", ["LITR1001"]],
  ["ENGL2001", "Nghe nói tiếng Anh nâng cao", 3, ENGLISH, "required", "major", ["ENGL1002"]],
  ["ENGL2010", "Ngữ âm học tiếng Anh", 2, ENGLISH, "required", "foundation"],
  ["PHYS1001", "Cơ học", 3, PHYSICS, "required", "foundation", ["MATH1011"]],
  ["PHYS1010", "Điện và từ", 3, PHYSICS, "required", "major", ["PHYS1001"]],
  ["PSYC2001", "Tâm lý học phát triển", 3, PSYCHOLOGY, "required", "major", ["PSYC1001"]],
  ["PSYC2010", "Tham vấn tâm lý học đường", 3, PSYCHOLOGY, "elective", "major", ["PSYC2001"]],
  ["COMP0999", "Tin học văn phòng nâng cao", 2, IT, "elective", "general"],
  ...CONDITIONAL_SEEDS,
];

const FACULTY_BY_PREFIX: Record<string, string> = {
  POLI: POLITICS,
  EDUC: EDUCATION,
  COMP: IT,
  MATH,
  LITR: LITERATURE,
  ENGL: ENGLISH,
  PHYS: PHYSICS,
  PSYC: PSYCHOLOGY,
};

const DECLARED = new Set(COURSE_SEEDS.map(([code]) => code));
const TRANSCRIPT_SEEDS: CourseSeed[] = [
  ...new Map(
    MOCK_MAJORS.flatMap((major) => mockCourseSequence(major.code))
      .filter(([code]) => !DECLARED.has(code))
      .map(([code, name, credits]): [string, CourseSeed] => {
        const internship = code[4] === "4";
        return [code, [code, name, credits, FACULTY_BY_PREFIX[code.slice(0, 4)], internship || credits >= 3 ? "required" : "elective", internship ? "internship" : "major"]];
      }),
  ).values(),
];

const COREQUISITES: Record<string, string[]> = {
  COMP1121: ["COMP1120"],
  MATH2020: ["EDUC1002"],
};

const EQUIVALENTS: Record<string, string[]> = {
  MATH1013: ["MATH1014"],
  MATH1014: ["MATH1013"],
  COMP1013: ["COMP0999"],
};

const DESCRIPTIONS: Record<string, string> = {
  COMP1020: "Mảng, danh sách liên kết, ngăn xếp, hàng đợi, cây, đồ thị và các giải thuật sắp xếp, tìm kiếm cơ bản.",
  COMP1070: "Xây dựng ứng dụng web theo mô hình client-server: HTML, CSS, JavaScript, REST API và cơ sở dữ liệu quan hệ.",
  COMP1080: "Tìm kiếm trong không gian trạng thái, biểu diễn tri thức, suy diễn và nhập môn học máy.",
};

const CONDITIONAL = new Set<string>(CONDITIONAL_COURSE_CODES);

export const COURSES: Course[] = [...COURSE_SEEDS, ...TRANSCRIPT_SEEDS].map(([code, name, credits, faculty, type, block, prerequisites = []]) => {
  const practiceCredits = code.startsWith("PHYE") ? credits : code === "DEFE1001" ? 3 : code.startsWith("COMP") && credits >= 3 ? 1 : 0;
  return {
    id: code.toLowerCase(),
    code,
    name,
    credits,
    theoryCredits: credits - practiceCredits,
    practiceCredits,
    faculty,
    type,
    block,
    prerequisiteCodes: prerequisites,
    corequisiteCodes: COREQUISITES[code] ?? [],
    equivalentCodes: EQUIVALENTS[code] ?? [],
    isActive: code !== "COMP0999" && code !== "MATH1014",
    isConditional: CONDITIONAL.has(code),
    description: DESCRIPTIONS[code] ?? `Học phần ${name.toLowerCase()} thuộc khối ${block === "general" ? "đại cương" : "ngành"}.`,
  };
});

export const PROGRAMS: Program[] = [
  { id: "ctdt-cntt-2023", code: "7480201", name: "Công nghệ thông tin", majorCode: "104", faculty: IT, degree: "Cử nhân", totalCredits: 130, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-06-12" },
  { id: "ctdt-cntt-2027", code: "7480201", name: "Công nghệ thông tin (cập nhật 2027)", majorCode: "104", faculty: IT, degree: "Cử nhân", totalCredits: 128, durationYears: 4, cohorts: [52], status: "draft", updatedAt: "2026-10-02" },
  { id: "ctdt-sptoan-2023", code: "7140209", name: "Sư phạm Toán học", majorCode: "101", faculty: MATH, degree: "Cử nhân Sư phạm", totalCredits: 135, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-05-20" },
  { id: "ctdt-spvan-2023", code: "7140217", name: "Sư phạm Ngữ văn", majorCode: "601", faculty: LITERATURE, degree: "Cử nhân Sư phạm", totalCredits: 135, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-05-28" },
  { id: "ctdt-nna-2023", code: "7220201", name: "Ngôn ngữ Anh", majorCode: "751", faculty: ENGLISH, degree: "Cử nhân", totalCredits: 132, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-04-15" },
  { id: "ctdt-spvl-2023", code: "7140211", name: "Sư phạm Vật lý", majorCode: "102", faculty: PHYSICS, degree: "Cử nhân Sư phạm", totalCredits: 135, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-05-02" },
  { id: "ctdt-tlh-2023", code: "7310401", name: "Tâm lý học", majorCode: "611", faculty: PSYCHOLOGY, degree: "Cử nhân", totalCredits: 130, durationYears: 4, cohorts: [48, 49, 50, 51], status: "active", updatedAt: "2025-06-01" },
  { id: "ctdt-cntt-2019", code: "7480201", name: "Công nghệ thông tin (2019)", majorCode: "104", faculty: IT, degree: "Cử nhân", totalCredits: 135, durationYears: 4, cohorts: [45, 46, 47], status: "archived", updatedAt: "2023-07-10" },
];

export const PROGRAM_COURSES: Record<string, ProgramCourse[]> = Object.fromEntries(
  PROGRAMS.filter((program) => program.status === "active").map((program) => [
    program.id,
    [
      ...mockCourseSequence(program.majorCode).map(([courseCode], position, all) => ({ courseCode, semester: Math.floor((position * program.durationYears * 2) / all.length) + 1 })),
      { courseCode: "PHYE1001", semester: 1 },
      { courseCode: "PHYE1002", semester: 2 },
      { courseCode: "DEFE1001", semester: 2 },
    ],
  ]),
);

export type ElectiveGroupSeed = { id: string; programId: string; name: string; minCredits: number; courseCodes: string[] };

const courseOf = new Map(COURSES.map((course) => [course.code, course]));

export const ELECTIVE_GROUPS: ElectiveGroupSeed[] = Object.entries(PROGRAM_COURSES).flatMap(([programId, plan]) => {
  const electives = plan.map((entry) => courseOf.get(entry.courseCode)!).filter((course) => course.type === "elective" && !course.isConditional && course.block !== "internship");
  const groups = [
    { key: "general", name: "Tự chọn đại cương", courses: electives.filter((course) => course.block === "general") },
    { key: "major", name: "Tự chọn chuyên ngành", courses: electives.filter((course) => course.block !== "general" && course.credits >= 3) },
    { key: "topic", name: "Chuyên đề tự chọn", courses: electives.filter((course) => course.block !== "general" && course.credits < 3) },
  ];
  return groups
    .filter((group) => group.courses.length > 0)
    .map((group) => {
      const total = group.courses.reduce((sum, course) => sum + course.credits, 0);
      const minCredits = group.courses.length === 1 ? total : Math.max(group.courses[0].credits, Math.floor(total / 2));
      return { id: `${programId}:${group.key}`, programId, name: group.name, minCredits, courseCodes: group.courses.map((course) => course.code) };
    });
});

export function conditionalResultSeeds(index: number, pastTermIds: string[], cohort: number) {
  const score = (offset: number) => (60 + ((index * 7 + offset * 3) % 35)) / 10;
  const [first, second] = pastTermIds;
  return [
    ...(first ? [{ courseCode: "PHYE1001", termId: first, score10: score(1) }] : []),
    ...(second
      ? [
          { courseCode: "PHYE1002", termId: second, score10: cohort >= 50 && index % 47 === 20 ? 3.5 : score(2) },
          { courseCode: "DEFE1001", termId: second, score10: score(3) },
        ]
      : []),
  ];
}

