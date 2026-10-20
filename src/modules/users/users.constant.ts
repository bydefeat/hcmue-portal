import type { StatusMeta } from "@/shared/constants/status.constant";
import type { AccountState, AccountStatus, ClassRef, DecisionKind, DecisionStatus, LecturerStatus, MajorRef, StudentStatus } from "@/modules/users/users.type";

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

export const ACCOUNT_STATUS: Record<AccountStatus, StatusMeta> = {
  none: { label: "Chưa cấp", tone: "neutral" },
  pending: { label: "Chưa kích hoạt", tone: "warning" },
  active: { label: "Đang dùng", tone: "success" },
  locked: { label: "Đã khóa", tone: "danger" },
};

export const NO_ACCOUNT: AccountState = { status: "none", lastSignInAt: null };

export const ACCOUNT_STATUS_OPTIONS = Object.entries(ACCOUNT_STATUS).map(([value, meta]) => ({ value: value as AccountStatus, label: meta.label }));

export const LECTURER_TITLES = ["ThS.", "TS.", "PGS.TS.", "GS.TS."];

export const USER_ROLES = [
  { value: "lecturer", label: "Giảng viên" },
  { value: "advisor", label: "Cố vấn học tập" },
  { value: "admin", label: "Quản trị" },
];

// Các hàm dựng options cho Select: danh mục ngành, khoa, khóa đọc từ DB ở page rồi truyền xuống.
export function majorOptions(majors: MajorRef[]) {
  return majors.map((major) => ({ value: major.code, label: major.name, faculty: major.faculty }));
}

export function facultiesOf(majors: Pick<MajorRef, "faculty">[]) {
  return [...new Set(majors.map((major) => major.faculty))].toSorted((a, b) => a.localeCompare(b, "vi"));
}

export function facultyOptions(faculties: string[]) {
  return faculties.map((faculty) => ({ value: faculty, label: faculty }));
}

export function cohortOptions(cohorts: number[]) {
  return cohorts.map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }));
}

// Khóa đang có lớp sinh hoạt cộng thêm khóa kế tiếp (tân sinh viên chưa có lớp nào).
export function withNextCohort(cohorts: number[]) {
  if (cohorts.length === 0) return [];
  return [...new Set([...cohorts, Math.max(...cohorts) + 1])].toSorted((a, b) => a - b);
}

// Gợi ý lớp sinh hoạt: lớp đã có của ngành và khóa; chưa có thì mượn mẫu tên lớp cùng ngành ở khóa khác
// ("49.01.CNTT.A" → "52.01.CNTT.A/B/C").
export function classSuggestions(classes: ClassRef[], cohort?: number, majorCode?: string) {
  if (!cohort || !majorCode) return [];
  const sameMajor = classes.filter((entry) => entry.majorCode === majorCode);
  const existing = [...new Set(sameMajor.filter((entry) => entry.cohort === cohort).map((entry) => entry.code))].toSorted();
  if (existing.length > 0) return existing.map((value) => ({ value }));
  const sample = sameMajor.find((entry) => /^\d+\..+\.[^.]+$/.test(entry.code));
  if (!sample) return [];
  const stem = sample.code.replace(/^\d+/, String(cohort)).replace(/\.[^.]+$/, "");
  return ["A", "B", "C"].map((section) => ({ value: `${stem}.${section}` }));
}

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
  lecturers_user_id_unique: "Tài khoản đăng nhập đã gắn với giảng viên khác.",
  staff_members_code_unique: "Mã cán bộ đã có.",
  staff_members_email_unique: "Email công vụ đã được dùng cho cán bộ khác.",
  staff_members_user_id_unique: "Tài khoản đăng nhập đã gắn với cán bộ khác.",
  user_email_unique: "Email này đã thuộc một tài khoản khác. Kiểm tra lại email hoặc liên hệ quản trị hệ thống.",
  user_username_unique: "Mã số này đã là tên đăng nhập của một tài khoản khác.",
  lecturers_email_unique: "Email công vụ đã được dùng cho giảng viên khác.",
  administrative_classes_code_unique: "Mã lớp sinh hoạt đã có.",
  student_decisions_number_index: "Số quyết định đã được dùng, thử lại.",
  student_decisions_signed_fields: "Quyết định đã ký phải có số và ngày ký.",
};
