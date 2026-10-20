import {
  createRandom,
  MOCK_COHORTS,
  mockId,
  mockLecturerIdentity,
  mockStudentIdentity,
  pickOne,
} from "@/shared/libs/mock.lib";
import type { AdvisorAssignment, Lecturer, Student, StudentStatus } from "@/modules/users/users.type";
import { studentEmailOf } from "@/shared/libs/student-code.lib";

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
    email: studentEmailOf(identity.code),
    phone: phone(random),
    faculty: identity.faculty,
    majorCode: identity.majorCode,
    majorName: identity.majorName,
    cohort: identity.cohort,
    className: identity.className,
    status: studentStatus(identity.cohort, random),
    hometown: pickOne(random, HOMETOWNS),
    personalEmail: "",
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
    personalEmail: "",
    office: "Văn phòng khoa, phòng B.201",
    officeHours: "Thứ 3 và thứ 5, 14:00 - 16:00",
    status: identity.index === 9 ? "on-leave" : "active",
    isAdvisor,
    roles: isAdvisor ? ["lecturer", "advisor"] : ["lecturer"],
  };
});

export const CURRENT_LECTURER_ID = mockId("lecturer:0");

export const CURRENT_STUDENT_ID = mockId("student:12");
