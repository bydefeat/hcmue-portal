export type CourseSeed = [code: string, name: string, credits: number];

const GENERAL: CourseSeed[] = [
  ["POLI1001", "Triết học Mác - Lênin", 3],
  ["ENGL1001", "Tiếng Anh 1", 3],
  ["PSYC1001", "Tâm lý học giáo dục", 3],
  ["POLI1002", "Kinh tế chính trị Mác - Lênin", 2],
  ["ENGL1002", "Tiếng Anh 2", 3],
  ["EDUC1001", "Giáo dục học đại cương", 2],
  ["POLI1003", "Chủ nghĩa xã hội khoa học", 2],
  ["POLI1004", "Lịch sử Đảng Cộng sản Việt Nam", 2],
  ["POLI1005", "Tư tưởng Hồ Chí Minh", 2],
  ["EDUC1002", "Phương pháp nghiên cứu khoa học giáo dục", 2],
];

const MAJOR_COURSES: Record<string, CourseSeed[]> = {
  "104": [
    ["COMP1010", "Lập trình cơ bản", 3], ["COMP1013", "Nhập môn công nghệ thông tin", 2], ["MATH1011", "Giải tích 1", 3],
    ["MATH1012", "Đại số tuyến tính", 3], ["COMP1020", "Cấu trúc dữ liệu và giải thuật", 3], ["COMP1031", "Lập trình hướng đối tượng", 3],
    ["MATH1020", "Toán rời rạc", 3], ["MATH1013", "Xác suất thống kê", 3], ["COMP1040", "Cơ sở dữ liệu", 3],
    ["COMP1050", "Mạng máy tính", 3], ["COMP1060", "Hệ điều hành", 3], ["COMP1070", "Phát triển ứng dụng web", 3],
    ["COMP1080", "Trí tuệ nhân tạo", 3], ["COMP1090", "Công nghệ phần mềm", 3], ["COMP1100", "Học máy", 3],
    ["COMP1110", "Phát triển ứng dụng di động", 3], ["COMP1120", "An toàn và bảo mật thông tin", 3], ["COMP1130", "Xử lý ngôn ngữ tự nhiên tiếng Việt", 3],
    ["COMP4900", "Thực tập nghề nghiệp", 4], ["COMP1140", "Điện toán đám mây", 3], ["COMP1150", "Kiểm thử phần mềm", 3],
    ["COMP1160", "Đồ họa máy tính", 3], ["COMP1170", "Khai phá dữ liệu", 3], ["COMP1180", "Phân tích thiết kế hệ thống", 3],
    ["COMP1190", "Lập trình song song", 3], ["COMP1200", "Chuyên đề công nghệ mới", 2], ["COMP1210", "Tin học trong giáo dục", 2],
    ["COMP1220", "Quản trị dự án phần mềm", 2], ["COMP1230", "Thị giác máy tính", 3], ["COMP1240", "Hệ quản trị cơ sở dữ liệu", 3],
    ["COMP1250", "Học sâu", 3], ["COMP1260", "Internet vạn vật", 3], ["COMP1270", "Phát triển trò chơi", 3],
    ["COMP1280", "Khoa học dữ liệu", 3], ["COMP4990", "Khóa luận tốt nghiệp", 7],
  ],
  "101": [
    ["MATH1011", "Giải tích 1", 3], ["MATH1012", "Đại số tuyến tính", 3], ["MATH2001", "Giải tích 2", 3], ["MATH1020", "Toán rời rạc", 3],
    ["MATH1013", "Xác suất thống kê", 3], ["MATH2010", "Hình học sơ cấp", 3], ["MATH2020", "Phương pháp dạy học môn Toán", 3], ["MATH2030", "Đại số đại cương", 3],
    ["MATH2040", "Giải tích phức", 3], ["MATH2050", "Hình học vi phân", 3], ["MATH2060", "Phương trình vi phân", 3], ["MATH2070", "Lý thuyết số", 2],
    ["MATH2080", "Tô pô đại cương", 3], ["MATH2090", "Phát triển chương trình môn Toán", 2], ["MATH2100", "Thực hành dạy học Toán", 2], ["MATH4900", "Thực tập sư phạm", 4],
    ["MATH2110", "Quy hoạch tuyến tính", 3], ["MATH2120", "Thống kê ứng dụng", 3], ["MATH2130", "Lịch sử toán học", 2], ["MATH2140", "Đánh giá trong dạy học Toán", 2],
    ["MATH2150", "Toán cao cấp cho giáo viên", 3], ["MATH2160", "Giải tích số", 3], ["MATH2170", "Chuyên đề hình học", 2], ["MATH2180", "Chuyên đề đại số", 2],
    ["MATH2190", "Ứng dụng CNTT dạy Toán", 2], ["MATH2200", "Seminar Toán", 2], ["MATH2210", "Lý thuyết đồ thị", 3], ["MATH2220", "Mật mã học", 3],
    ["MATH2230", "Toán tài chính", 2], ["MATH2240", "Giáo dục STEM", 2],
  ],
};

function majorCourses(majorCode: string): CourseSeed[] {
  const own = MAJOR_COURSES[majorCode];
  if (own) return own;
  const prefix = { "601": "LITR", "751": "ENGL", "102": "PHYS", "611": "PSYC" }[majorCode] ?? "GENL";
  const topic = { "601": "Ngữ văn", "751": "Tiếng Anh", "102": "Vật lý", "611": "Tâm lý học" }[majorCode] ?? "Chuyên ngành";
  return Array.from({ length: 30 }, (_, index) => [`${prefix}${2000 + index * 10}`, `${topic} chuyên ngành ${index + 1}`, index % 4 === 3 ? 2 : 3]);
}

export const TERMS_DONE_BY_COHORT: Record<number, number> = { 48: 8, 49: 6, 50: 4, 51: 2 };

export const COURSES_PER_PAST_TERM = 6;
export const COURSES_IN_CURRENT_TERM = 5;

export function mockCourseSequence(majorCode: string): CourseSeed[] {
  const pool = [...GENERAL, ...majorCourses(majorCode)];
  return pool
    .map((course, position) => ({ course, order: position < GENERAL.length ? position * 3 : position * 1.4 }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.course);
}

export function mockCoursesTaken(cohort: number) {
  const termsDone = TERMS_DONE_BY_COHORT[cohort] ?? 0;
  return termsDone * COURSES_PER_PAST_TERM + (cohort === 48 ? 0 : COURSES_IN_CURRENT_TERM);
}
