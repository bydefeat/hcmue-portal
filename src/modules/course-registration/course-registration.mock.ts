import { createRandom, mockDate, mockLecturerIdentity, mockStudentIdentity } from "@/shared/libs/mock.lib";
import type { ClassMeeting, ClassSection, ClassSectionStatus, RegistrationHold, RegistrationPeriod, ReservedSeat, SectionAudience, Term } from "@/modules/course-registration/course-registration.type";

export const TERMS: Term[] = [
  { id: "hk2-2025", code: "2025-2026.2", name: "Học kỳ 2, năm học 2025-2026", shortName: "HK2 2025-2026", startDate: "2026-02-23", endDate: "2026-06-27", isCurrent: false, isRegistrationTarget: false },
  { id: "hk3-2025", code: "2025-2026.3", name: "Học kỳ hè, năm học 2025-2026", shortName: "Hè 2025-2026", startDate: "2026-07-06", endDate: "2026-08-15", isCurrent: false, isRegistrationTarget: false },
  { id: "hk1-2026", code: "2026-2027.1", name: "Học kỳ 1, năm học 2026-2027", shortName: "HK1 2026-2027", startDate: "2026-09-07", endDate: "2027-01-16", isCurrent: true, isRegistrationTarget: false },
  { id: "hk2-2026", code: "2026-2027.2", name: "Học kỳ 2, năm học 2026-2027", shortName: "HK2 2026-2027", startDate: "2027-02-22", endDate: "2027-06-26", isCurrent: false, isRegistrationTarget: true },
];

export const REGISTRATION_PERIODS: RegistrationPeriod[] = [
  { id: "dot-hk1-1", termId: "hk1-2026", name: "Đợt 1, khóa 48 và 49", cohorts: [48, 49], opensAt: "2026-08-03T01:00:00Z", closesAt: "2026-08-09T10:00:00Z", minCredits: 14, maxCredits: 25, eligibleStudents: 268, registeredStudents: 259 },
  { id: "dot-hk1-2", termId: "hk1-2026", name: "Đợt 2, khóa 50 và 51", cohorts: [50, 51], opensAt: "2026-08-12T01:00:00Z", closesAt: "2026-08-18T10:00:00Z", minCredits: 14, maxCredits: 25, eligibleStudents: 300, registeredStudents: 296 },
  { id: "dot-hk1-3", termId: "hk1-2026", name: "Đợt điều chỉnh", cohorts: [48, 49, 50, 51], opensAt: "2026-09-07T01:00:00Z", closesAt: "2026-09-13T10:00:00Z", minCredits: 14, maxCredits: 25, eligibleStudents: 568, registeredStudents: 74 },
  { id: "dot-hk2-1", termId: "hk2-2026", name: "Đợt 1, khóa 48 và 49", cohorts: [48, 49], opensAt: mockDate(-4, "08:00"), closesAt: mockDate(1, "17:00"), minCredits: 14, maxCredits: 25, eligibleStudents: 268, registeredStudents: 187 },
  { id: "dot-hk2-2", termId: "hk2-2026", name: "Đợt 2, khóa 50 và 51", cohorts: [50, 51], opensAt: mockDate(5, "08:00"), closesAt: mockDate(11, "17:00"), minCredits: 14, maxCredits: 25, eligibleStudents: 300, registeredStudents: 0 },
  { id: "dot-hk2-3", termId: "hk2-2026", name: "Đợt điều chỉnh", cohorts: [48, 49, 50, 51], opensAt: mockDate(24, "08:00"), closesAt: mockDate(28, "17:00"), minCredits: 14, maxCredits: 25, eligibleStudents: 568, registeredStudents: 0 },
];

export const COURSE_INFO: Record<string, { name: string; credits: number; faculty: string }> = {
  POLI1001: { name: "Triết học Mác - Lênin", credits: 3, faculty: "Khoa Lý luận chính trị" },
  POLI1003: { name: "Chủ nghĩa xã hội khoa học", credits: 2, faculty: "Khoa Lý luận chính trị" },
  ENGL1002: { name: "Tiếng Anh 2", credits: 3, faculty: "Khoa Tiếng Anh" },
  PSYC1001: { name: "Tâm lý học giáo dục", credits: 3, faculty: "Khoa Tâm lý học" },
  EDUC1001: { name: "Giáo dục học đại cương", credits: 2, faculty: "Khoa Khoa học Giáo dục" },
  MATH1011: { name: "Giải tích 1", credits: 3, faculty: "Khoa Toán - Tin học" },
  MATH1013: { name: "Xác suất thống kê", credits: 3, faculty: "Khoa Toán - Tin học" },
  MATH2001: { name: "Giải tích 2", credits: 3, faculty: "Khoa Toán - Tin học" },
  MATH2020: { name: "Phương pháp dạy học môn Toán", credits: 3, faculty: "Khoa Toán - Tin học" },
  COMP1010: { name: "Lập trình cơ bản", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1020: { name: "Cấu trúc dữ liệu và giải thuật", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1031: { name: "Lập trình hướng đối tượng", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1040: { name: "Cơ sở dữ liệu", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1060: { name: "Hệ điều hành", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1070: { name: "Phát triển ứng dụng web", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1080: { name: "Trí tuệ nhân tạo", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1090: { name: "Công nghệ phần mềm", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1100: { name: "Học máy", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1120: { name: "An toàn và bảo mật thông tin", credits: 3, faculty: "Khoa Công nghệ Thông tin" },
  COMP1121: { name: "Thực hành an toàn thông tin", credits: 1, faculty: "Khoa Công nghệ Thông tin" },
  LITR1010: { name: "Văn học Việt Nam hiện đại", credits: 3, faculty: "Khoa Ngữ văn" },
  LITR1020: { name: "Lý luận văn học", credits: 3, faculty: "Khoa Ngữ văn" },
  ENGL2001: { name: "Nghe nói tiếng Anh nâng cao", credits: 3, faculty: "Khoa Tiếng Anh" },
  PHYS1010: { name: "Điện và từ", credits: 3, faculty: "Khoa Vật lý" },
  PSYC2001: { name: "Tâm lý học phát triển", credits: 3, faculty: "Khoa Tâm lý học" },
};

type SectionSeed = [
  courseCode: string,
  sectionNumber: number,
  lecturerIndex: number | null,
  capacity: number,
  enrolled: number,
  meetings: [day: number, start: number, end: number, room: string][],
  status?: ClassSectionStatus,
];

const CURRENT_TERM_SECTIONS: SectionSeed[] = [
  ["COMP1020", 1, 0, 45, 42, [[2, 1, 3, "B.405"]]],
  ["COMP1020", 2, 0, 45, 38, [[4, 7, 9, "B.405"]]],
  ["COMP1070", 1, 0, 40, 40, [[5, 1, 3, "C.301 (Phòng máy)"]]],
  ["COMP1080", 1, 0, 50, 47, [[6, 7, 9, "B.302"]]],
  ["COMP1010", 1, 6, 50, 49, [[2, 7, 9, "C.302 (Phòng máy)"]]],
  ["COMP1010", 2, 12, 50, 44, [[3, 1, 3, "C.302 (Phòng máy)"]]],
  ["COMP1031", 1, 18, 45, 45, [[3, 7, 9, "C.301 (Phòng máy)"]]],
  ["COMP1040", 1, 6, 45, 41, [[4, 1, 3, "B.408"]]],
  ["COMP1060", 1, 12, 45, 36, [[5, 7, 9, "B.408"]]],
  ["COMP1090", 1, 18, 45, 39, [[6, 1, 3, "B.405"]]],
  ["MATH1011", 1, 1, 60, 58, [[2, 1, 3, "A.201"]]],
  ["MATH1013", 1, 7, 60, 52, [[4, 4, 6, "A.201"]]],
  ["MATH2001", 1, 13, 50, 31, [[5, 4, 6, "A.203"]]],
  ["MATH2020", 1, 19, 40, 36, [[6, 4, 6, "A.305"]]],
  ["LITR1010", 1, 2, 50, 47, [[2, 4, 6, "H.2.04"]]],
  ["LITR1020", 1, 8, 50, 42, [[3, 4, 6, "H.2.04"]]],
  ["ENGL1002", 1, 3, 35, 35, [[2, 7, 9, "H.3.11"]]],
  ["ENGL1002", 2, 9, 35, 33, [[4, 7, 9, "H.3.11"]]],
  ["ENGL2001", 1, 15, 30, 28, [[5, 1, 3, "H.3.11"]]],
  ["PHYS1010", 1, 4, 45, 34, [[3, 1, 3, "A.305"]]],
  ["PSYC1001", 1, 5, 80, 76, [[6, 1, 3, "I.101 (Hội trường)"]]],
  ["PSYC2001", 1, 11, 50, 40, [[4, 1, 3, "A.203"]]],
  ["POLI1001", 1, null, 120, 118, [[7, 1, 4, "I.101 (Hội trường)"]]],
  ["EDUC1001", 1, 17, 80, 64, [[5, 7, 9, "I.101 (Hội trường)"]]],
];

const TARGET_TERM_SECTIONS: SectionSeed[] = [
  ["COMP1031", 1, 0, 45, 45, [[2, 1, 3, "C.301 (Phòng máy)"]]],
  ["COMP1031", 2, 18, 45, 39, [[4, 1, 3, "C.301 (Phòng máy)"]]],
  ["COMP1060", 1, 12, 45, 28, [[3, 7, 9, "B.405"]]],
  ["COMP1090", 1, 0, 45, 33, [[5, 7, 9, "B.405"]]],
  ["COMP1100", 1, 0, 40, 40, [[6, 1, 3, "C.302 (Phòng máy)"]]],
  ["COMP1100", 2, 6, 40, 12, [[6, 2, 4, "C.302 (Phòng máy)"]]],
  ["COMP1120", 1, 12, 40, 21, [[4, 7, 9, "B.408"]]],
  ["COMP1040", 1, 6, 45, 30, [[3, 1, 3, "B.408"]]],
  ["MATH1013", 1, 7, 60, 41, [[2, 4, 6, "A.201"]]],
  ["MATH2001", 1, 13, 50, 18, [[5, 4, 6, "A.203"]]],
  ["MATH2020", 1, 19, 40, 0, [[6, 4, 6, "A.305"]], "draft"],
  ["LITR1020", 1, 8, 50, 26, [[3, 4, 6, "H.2.04"]]],
  ["ENGL2001", 1, 15, 30, 30, [[5, 1, 3, "H.3.11"]]],
  ["ENGL2001", 2, null, 30, 0, [[5, 7, 9, "H.3.11"]], "draft"],
  ["PHYS1010", 1, 4, 45, 9, [[3, 1, 3, "A.305"]]],
  ["PSYC2001", 1, 11, 50, 22, [[4, 1, 3, "A.203"]]],
  ["POLI1003", 1, null, 120, 77, [[7, 1, 3, "I.101 (Hội trường)"]]],
  ["COMP1080", 2, 0, 50, 0, [[6, 1, 3, "B.302"]], "draft"],
  ["MATH1011", 2, 1, 60, 0, [[2, 1, 3, "A.201"]], "cancelled"],
  ["COMP1121", 1, 12, 40, 18, [[4, 10, 12, "C.301 (Phòng máy)"]]],
  ["PSYC2001", 2, 11, 50, 9, [[6, 7, 9, "A.203"]]],
];

export const MIN_ENROLLMENT = 15;

const AUDIENCES: Record<string, SectionAudience> = {
  "hk2-2026:LITR1020.01": { majorCodes: ["601"], cohorts: [], note: "Lớp dành cho sinh viên ngành Sư phạm Ngữ văn" },
  "hk2-2026:ENGL2001.01": { majorCodes: [], cohorts: [48, 49], note: "Lớp dành cho khóa 48 và 49 cần hoàn thành chuẩn đầu ra" },
  "hk2-2026:MATH2020.01": { majorCodes: ["101"], cohorts: [], note: "Lớp dành cho sinh viên ngành Sư phạm Toán học" },
  "hk2-2026:PSYC2001.02": { majorCodes: ["611", "101", "601", "102"], cohorts: [], note: "Ưu tiên ngành sư phạm và Tâm lý học" },
};

const RESERVED: Record<string, ReservedSeat[]> = {
  "hk2-2026:COMP1060.01": [{ label: "Khóa 48 cần để tốt nghiệp đúng hạn", seats: 10, taken: 0, majorCodes: [], cohorts: [48] }],
  "hk2-2026:COMP1040.01": [{ label: "Sinh viên học lại", seats: 5, taken: 2, majorCodes: ["104"], cohorts: [48, 49] }],
  "hk2-2026:MATH1013.01": [{ label: "Ngành Sư phạm Toán học", seats: 15, taken: 9, majorCodes: ["101"], cohorts: [] }],
};

type LabSeed = [labCode: string, day: number, start: number, end: number, room: string, capacity: number, enrolled: number];

const LABS: Record<string, LabSeed[]> = {
  "hk2-2026:COMP1100.01": [
    ["TH1", 7, 1, 3, "C.302 (Phòng máy)", 20, 20],
    ["TH2", 7, 4, 6, "C.302 (Phòng máy)", 20, 20],
  ],
  "hk2-2026:COMP1100.02": [
    ["TH1", 7, 1, 3, "C.301 (Phòng máy)", 20, 7],
    ["TH2", 7, 7, 9, "C.301 (Phòng máy)", 20, 5],
    ["TH3", 3, 10, 12, "C.302 (Phòng máy)", 20, 20],
  ],
  "hk2-2026:COMP1031.02": [
    ["TH1", 5, 7, 9, "C.301 (Phòng máy)", 23, 21],
    ["TH2", 5, 10, 12, "C.301 (Phòng máy)", 22, 18],
  ],
};

export const REGISTRATION_HOLDS: RegistrationHold[] = [
  [29, "tuition", true, "Nợ học phí học kỳ 2, năm học 2025-2026: 8.320.000 đ", "Nộp đủ học phí qua tài khoản định danh, khóa tự gỡ sau 1 ngày làm việc"],
  [77, "discipline", true, "Đang trong thời gian kỷ luật đình chỉ học tập", "Chờ hết thời hạn kỷ luật theo quyết định 1229/QĐ-ĐHSP"],
  [5, "academic-status", true, "Đang xét buộc thôi học do cảnh báo học vụ mức 3", "Chờ kết luận của Hội đồng xét học vụ"],
  [60, "academic-status", true, "Đang làm thủ tục bảo lưu học kỳ 2", "Rút đơn bảo lưu tại Phòng Đào tạo nếu muốn tiếp tục học"],
  [130, "tuition", true, "Nợ học phí học kỳ 1, năm học 2026-2027 quá hạn", "Nộp học phí hoặc nộp đơn xin gia hạn tại Phòng Kế hoạch - Tài chính"],
  [204, "documents", true, "Chưa nộp bằng tốt nghiệp THPT bản chính để đối chiếu", "Mang bản chính đến Phòng Đào tạo, phòng A.102"],
  [18, "advisor", false, "Kế hoạch học tập học kỳ 2 bị cố vấn trả lại", "Sửa kế hoạch theo góp ý của cố vấn và nộp lại"],
  [12, "documents", false, "Thiếu bản sao giấy khai sinh trong hồ sơ nhập học", "Nộp tại Phòng Đào tạo trước 30/11, không ảnh hưởng đăng ký học phần"],
  [96, "tuition", false, "Học phí học kỳ 1 còn thiếu 1.040.000 đ, hạn 28/10", "Nộp trước hạn để tránh bị khóa đăng ký"],
].map(([index, kind, blocking, reason, resolveHint], position) => {
  const student = mockStudentIdentity(index as number);
  return {
    id: `khoa-${position + 1}`,
    studentId: student.id,
    studentCode: student.code,
    studentName: student.fullName,
    className: student.className,
    faculty: student.faculty,
    kind: kind as RegistrationHold["kind"],
    blocking: blocking as boolean,
    reason: reason as string,
    resolveHint: resolveHint as string,
    createdAt: mockDate(-(position * 3 + 2), "09:00"),
    createdBy: kind === "tuition" ? "Phòng Kế hoạch - Tài chính" : "Phòng Đào tạo",
    releasedAt: null,
    releasedBy: null,
  };
});

function meeting([dayOfWeek, startPeriod, endPeriod, room]: SectionSeed[5][number]): ClassMeeting {
  return { dayOfWeek, startPeriod, endPeriod, room };
}

function buildSections(termId: string, seeds: SectionSeed[]): ClassSection[] {
  const term = TERMS.find((entry) => entry.id === termId)!;
  return seeds.map(([courseCode, sectionNumber, lecturerIndex, capacity, enrolled, meetings, status = "open"]) => {
    const info = COURSE_INFO[courseCode];
    const lecturer = lecturerIndex === null ? null : mockLecturerIdentity(lecturerIndex);
    const code = `${courseCode}.${String(sectionNumber).padStart(2, "0")}`;
    return {
      id: `${termId}-${code.toLowerCase().replace(".", "-")}`,
      code,
      termId,
      courseCode,
      courseName: info.name,
      credits: info.credits,
      faculty: info.faculty,
      lecturerId: lecturer?.id ?? null,
      lecturerName: lecturer?.displayName ?? null,
      capacity,
      enrolled,
      meetings: meetings.map(meeting),
      status,
      startDate: term.startDate,
      endDate: term.endDate,
      minEnrollment: MIN_ENROLLMENT,
      audience: AUDIENCES[`${termId}:${code}`] ?? null,
      reservedSeats: RESERVED[`${termId}:${code}`] ?? [],
      labGroups: (LABS[`${termId}:${code}`] ?? []).map(([labCode, day, start, end, room, labCapacity, labEnrolled]) => ({
        id: `${termId}-${code}-${labCode}`.toLowerCase().replace(/\./g, "-"),
        code: `${code}.${labCode}`,
        meeting: { dayOfWeek: day, startPeriod: start, endPeriod: end, room },
        capacity: labCapacity,
        enrolled: labEnrolled,
      })),
    };
  });
}

export const CLASS_SECTIONS: ClassSection[] = [
  ...buildSections("hk1-2026", CURRENT_TERM_SECTIONS),
  ...buildSections("hk2-2026", TARGET_TERM_SECTIONS),
];

const STUDENT_POOL_SIZE = 600;
const MAJOR_COUNT = 6;

export function rosterIndices(sectionId: string, size: number, preferMajor: number) {
  const random = createRandom([...sectionId].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7));
  const preferred = Array.from({ length: STUDENT_POOL_SIZE / MAJOR_COUNT }, (_, index) => index * MAJOR_COUNT + preferMajor);
  const others = Array.from({ length: STUDENT_POOL_SIZE }, (_, index) => index).filter((index) => index % MAJOR_COUNT !== preferMajor);
  const shuffle = (values: number[]) =>
    values
      .map((value) => ({ value, order: random() }))
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.value);
  const picked = [...shuffle(preferred).slice(0, Math.round(size * 0.85)), ...shuffle(others)];
  return picked.slice(0, size);
}

export const FACULTY_MAJOR_INDEX: Record<string, number> = {
  "Khoa Công nghệ Thông tin": 0,
  "Khoa Toán - Tin học": 1,
  "Khoa Ngữ văn": 2,
  "Khoa Tiếng Anh": 3,
  "Khoa Vật lý": 4,
  "Khoa Tâm lý học": 5,
};
