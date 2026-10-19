import type { StatusMeta } from "@/shared/constants/status.constant";
import { MOCK_COHORTS, MOCK_MAJORS } from "@/shared/libs/mock.lib";
import type { DecisionKind, DecisionStatus, LecturerStatus, StudentStatus } from "@/modules/users/users.type";

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

export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  reserve: "Bảo lưu kết quả học tập",
  resume: "Tiếp tục học sau bảo lưu",
  suspend: "Tạm ngừng học",
  expel: "Buộc thôi học",
  "major-change": "Chuyển ngành",
  reward: "Khen thưởng",
  discipline: "Kỷ luật",
  graduate: "Công nhận tốt nghiệp",
};

export const DECISION_STATUS: Record<DecisionStatus, StatusMeta> = {
  draft: { label: "Dự thảo", tone: "neutral" },
  "pending-signature": { label: "Chờ ký", tone: "warning" },
  signed: { label: "Đã ký", tone: "success" },
  revoked: { label: "Đã thu hồi", tone: "danger" },
};

export const DECISION_KIND_OPTIONS = Object.entries(DECISION_KIND_LABEL).map(([value, label]) => ({ value, label }));

export const USERS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  students_code_unique: "Mã sinh viên đã thuộc về sinh viên khác. Kiểm tra lại mã trên giấy báo nhập học.",
  students_email_unique: "Email đã được dùng cho sinh viên khác.",
  students_user_id_unique: "Tài khoản đăng nhập đã gắn với sinh viên khác.",
  lecturers_code_unique: "Mã giảng viên đã có.",
  lecturers_email_unique: "Email công vụ đã được dùng cho giảng viên khác.",
  administrative_classes_code_unique: "Mã lớp sinh hoạt đã có.",
  student_decisions_number_index: "Số quyết định đã được dùng, thử lại.",
  student_decisions_signed_fields: "Quyết định đã ký phải có số và ngày ký.",
};
