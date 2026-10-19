import {
  createRandom,
  mockDate,
  MOCK_COHORTS,
  MOCK_MAJORS,
  mockLecturerIdentity,
  mockStudentIdentity,
  pickOne,
} from "@/shared/libs/mock.lib";
import type { AdvisorAssignment, DecisionKind, DecisionStatus, Lecturer, Student, StudentDecision, StudentStatus } from "@/modules/users/users.type";

const STUDENT_COUNT = 600;
const LECTURER_COUNT = 24;
const HOMETOWNS = ["TP. Hồ Chí Minh", "Đồng Nai", "Bình Dương", "Long An", "Tiền Giang", "Bến Tre", "Khánh Hòa", "Lâm Đồng", "Đắk Lắk", "Cần Thơ", "Bình Thuận", "Quảng Ngãi"];

function asciiSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function studentStatus(cohort: number, random: () => number): StudentStatus {
  const roll = random();
  if (cohort === MOCK_COHORTS[0] && roll < 0.35) return "graduated";
  if (roll > 0.975) return "suspended";
  if (roll > 0.95) return "reserved";
  return "studying";
}

function phone(random: () => number) {
  const prefix = pickOne(random, ["090", "093", "097", "098", "086", "035", "077"]);
  return `${prefix}${String(Math.floor(random() * 10_000_000)).padStart(7, "0")}`;
}

export const STUDENTS: Student[] = Array.from({ length: STUDENT_COUNT }, (_, index) => {
  const identity = mockStudentIdentity(index);
  const random = createRandom(index + 31);
  const birthYear = 2000 + (identity.cohort - 48) + 4;
  const month = String(1 + Math.floor(random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(random() * 28)).padStart(2, "0");
  return {
    id: identity.id,
    code: identity.code,
    fullName: identity.fullName,
    gender: identity.gender,
    dateOfBirth: `${birthYear}-${month}-${day}`,
    email: `${identity.code}@student.hcmue.edu.vn`,
    phone: phone(random),
    faculty: identity.faculty,
    majorCode: identity.majorCode,
    majorName: identity.majorName,
    cohort: identity.cohort,
    className: identity.className,
    status: studentStatus(identity.cohort, random),
    hometown: pickOne(random, HOMETOWNS),
  };
});

const LECTURER_IDENTITIES = Array.from({ length: LECTURER_COUNT }, (_, index) => mockLecturerIdentity(index));

function advisorFor(faculty: string, cohort: number, section: string) {
  const pool = LECTURER_IDENTITIES.filter((lecturer) => lecturer.faculty === faculty);
  const cohortIndex = MOCK_COHORTS.indexOf(cohort as (typeof MOCK_COHORTS)[number]);
  if (section === "A") return pool[cohortIndex === 1 || cohortIndex === 2 ? 0 : 1];
  if (cohortIndex === MOCK_COHORTS.length - 1) return null;
  return pool[2 + (cohortIndex % 2)];
}

const CLASS_NAMES = [...new Set(STUDENTS.map((student) => student.className))].toSorted();

export const ADVISOR_ASSIGNMENTS: AdvisorAssignment[] = CLASS_NAMES.map((className) => {
  const members = STUDENTS.filter((student) => student.className === className);
  const sample = members[0];
  const advisor = advisorFor(sample.faculty, sample.cohort, className.slice(-1));
  return {
    className,
    faculty: sample.faculty,
    majorName: sample.majorName,
    cohort: sample.cohort,
    studentCount: members.length,
    advisorId: advisor?.id ?? null,
    advisorName: advisor?.displayName ?? null,
  };
});

export const LECTURERS: Lecturer[] = LECTURER_IDENTITIES.map((identity) => {
  const random = createRandom(identity.index + 701);
  const isAdvisor = ADVISOR_ASSIGNMENTS.some((assignment) => assignment.advisorId === identity.id);
  const nameParts = asciiSlug(identity.fullName).split(" ");
  return {
    id: identity.id,
    code: identity.code,
    fullName: identity.fullName,
    title: identity.title,
    displayName: identity.displayName,
    gender: identity.gender,
    faculty: identity.faculty,
    email: `${nameParts.at(-1)}${nameParts.slice(0, -1).map((part) => part[0]).join("")}@hcmue.edu.vn`,
    phone: phone(random),
    status: identity.index === 9 ? "on-leave" : "active",
    isAdvisor,
    roles: isAdvisor ? ["lecturer", "advisor"] : ["lecturer"],
  };
});

export const CURRENT_LECTURER_ID = "gv-0";

export const CURRENT_STUDENT_ID = "sv-12";

export const MAJORS = MOCK_MAJORS;

type DecisionSeed = [studentIndex: number, kind: DecisionKind, status: DecisionStatus, daysAgo: number, title: string, basis: string];

const DECISION_SEEDS: DecisionSeed[] = [
  [60, "reserve", "pending-signature", 1, "Bảo lưu kết quả học tập học kỳ 2, năm học 2026-2027", "Đơn DT-2026-01255 đã qua cố vấn và khoa"],
  [133, "reserve", "draft", 0, "Bảo lưu kết quả học tập 2 học kỳ", "Đơn DT-2026-01285, chờ Phòng Đào tạo hoàn thiện hồ sơ"],
  [29, "suspend", "signed", 40, "Tạm ngừng học do nợ học phí 2 học kỳ", "Biên bản rà soát học phí của Phòng Kế hoạch - Tài chính"],
  [5, "expel", "pending-signature", 3, "Buộc thôi học do bị cảnh báo học vụ mức 3", "Kết quả xét học vụ học kỳ 2, năm học 2025-2026"],
  [42, "major-change", "signed", 55, "Chuyển từ ngành Sư phạm Vật lý sang Sư phạm Toán học", "Đơn chuyển ngành, có ý kiến của hai khoa"],
  [12, "reward", "signed", 60, "Khen thưởng sinh viên đạt thành tích học tập xuất sắc năm học 2025-2026", "Danh sách xét khen thưởng toàn trường"],
  [18, "reward", "signed", 60, "Khen thưởng sinh viên đạt giải Olympic Toán học sinh viên", "Giải Nhì Olympic Toán học sinh viên toàn quốc 2026"],
  [77, "discipline", "signed", 90, "Khiển trách do vi phạm quy chế thi", "Biên bản vi phạm quy chế thi học kỳ 2"],
  [3, "graduate", "draft", 0, "Công nhận tốt nghiệp đợt tháng 12 năm 2026", "Kết quả xét tốt nghiệp của Hội đồng"],
  [99, "resume", "signed", 25, "Tiếp tục học sau thời gian bảo lưu", "Hết thời hạn bảo lưu 1 học kỳ"],
  [210, "reserve", "revoked", 15, "Bảo lưu kết quả học tập học kỳ 1, năm học 2026-2027", "Sinh viên rút đơn trước ngày quyết định có hiệu lực"],
];

export const DECISIONS: StudentDecision[] = DECISION_SEEDS.map(([index, kind, status, daysAgo, title, basis], position) => {
  const student = STUDENTS[index];
  const signed = status === "signed" || status === "revoked";
  return {
    id: `qd-${position + 1}`,
    number: signed || status === "pending-signature" ? `${1180 + position * 7}/QĐ-ĐHSP` : null,
    kind,
    studentId: student.id,
    studentCode: student.code,
    studentName: student.fullName,
    className: student.className,
    faculty: student.faculty,
    title,
    effectiveDate: mockDate(-daysAgo + 7, "00:00"),
    signedBy: signed ? "PGS.TS. Ngô Đức Thịnh, Phó Hiệu trưởng" : null,
    signedAt: signed ? mockDate(-daysAgo, "15:00") : null,
    status,
    basis,
  };
});
