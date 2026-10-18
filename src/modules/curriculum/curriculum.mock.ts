import type { Course, CourseType, KnowledgeBlock, Program, ProgramCourse } from "./curriculum.type";

type CourseSeed = [code: string, name: string, credits: number, faculty: string, type: CourseType, block: KnowledgeBlock, prerequisites?: string[]];

const POLITICS = "Khoa Lý luận chính trị";
const EDUCATION = "Khoa Khoa học Giáo dục";
const IT = "Khoa Công nghệ Thông tin";
const MATH = "Khoa Toán - Tin học";
const LITERATURE = "Khoa Ngữ văn";
const ENGLISH = "Khoa Tiếng Anh";
const PHYSICS = "Khoa Vật lý";
const PSYCHOLOGY = "Khoa Tâm lý học";

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
];

const DESCRIPTIONS: Record<string, string> = {
  COMP1020: "Mảng, danh sách liên kết, ngăn xếp, hàng đợi, cây, đồ thị và các giải thuật sắp xếp, tìm kiếm cơ bản.",
  COMP1070: "Xây dựng ứng dụng web theo mô hình client-server: HTML, CSS, JavaScript, REST API và cơ sở dữ liệu quan hệ.",
  COMP1080: "Tìm kiếm trong không gian trạng thái, biểu diễn tri thức, suy diễn và nhập môn học máy.",
};

export const COURSES: Course[] = COURSE_SEEDS.map(([code, name, credits, faculty, type, block, prerequisites = []]) => {
  const practiceCredits = code.startsWith("COMP") && credits >= 3 ? 1 : 0;
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
    isActive: code !== "COMP0999",
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

function semesters(plan: [semester: number, codes: string[]][]): ProgramCourse[] {
  return plan.flatMap(([semester, codes]) => codes.map((courseCode) => ({ courseCode, semester })));
}

export const PROGRAM_COURSES: Record<string, ProgramCourse[]> = {
  "ctdt-cntt-2023": semesters([
    [1, ["POLI1001", "ENGL1001", "MATH1011", "MATH1012", "COMP1010", "COMP1013"]],
    [2, ["POLI1002", "ENGL1002", "MATH1020", "MATH1013", "COMP1020", "COMP1031"]],
    [3, ["POLI1003", "PSYC1001", "COMP1040", "COMP1050", "COMP1060"]],
    [4, ["POLI1004", "EDUC1001", "COMP1070", "COMP1080", "COMP1090"]],
    [5, ["POLI1005", "COMP1100", "COMP1110", "COMP1120"]],
    [6, ["EDUC1002", "COMP1130", "COMP0999"]],
    [7, ["COMP4900"]],
    [8, ["COMP4990"]],
  ]),
  "ctdt-sptoan-2023": semesters([
    [1, ["POLI1001", "ENGL1001", "MATH1011", "MATH1012", "PSYC1001"]],
    [2, ["POLI1002", "ENGL1002", "MATH2001", "MATH1020", "EDUC1001"]],
    [3, ["POLI1003", "MATH1013", "MATH2010", "COMP1010"]],
    [4, ["POLI1004", "POLI1005", "MATH2020", "EDUC1002"]],
  ]),
};
