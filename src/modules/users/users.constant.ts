import type { StatusMeta } from "@/shared/constants/status.constant";
import { MOCK_COHORTS, MOCK_MAJORS } from "@/shared/libs/mock.lib";
import type { LecturerStatus, StudentStatus } from "./users.type";

export const STUDENT_STATUS: Record<StudentStatus, StatusMeta> = {
  studying: { label: "Đang học", tone: "neutral" },
  reserved: { label: "Bảo lưu", tone: "warning" },
  suspended: { label: "Tạm ngừng học", tone: "danger" },
  graduated: { label: "Đã tốt nghiệp", tone: "success" },
};

export const LECTURER_STATUS: Record<LecturerStatus, StatusMeta> = {
  active: { label: "Đang giảng dạy", tone: "neutral" },
  "on-leave": { label: "Nghỉ phép", tone: "warning" },
};

export const LECTURER_TITLES = ["ThS.", "TS.", "PGS.TS.", "GS.TS."];

export const USER_ROLES = [
  { value: "lecturer", label: "Giảng viên" },
  { value: "advisor", label: "Cố vấn học tập" },
  { value: "admin", label: "Quản trị" },
];

export const MAJOR_OPTIONS = MOCK_MAJORS.map((major) => ({ value: major.code, label: major.name, faculty: major.faculty }));

export const FACULTY_OPTIONS = [...new Set(MOCK_MAJORS.map((major) => major.faculty))].map((faculty) => ({
  value: faculty,
  label: faculty,
}));

export const COHORT_OPTIONS = MOCK_COHORTS.map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }));

export const STUDENT_STATUS_OPTIONS = Object.entries(STUDENT_STATUS).map(([value, meta]) => ({
  value: value as StudentStatus,
  label: meta.label,
}));

export const GENDER_LABEL = { female: "Nữ", male: "Nam" } as const;
