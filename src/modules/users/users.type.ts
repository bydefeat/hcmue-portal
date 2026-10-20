import type { MockGender } from "@/shared/libs/mock.lib";

export type StudentStatus = "studying" | "reserved" | "suspended" | "graduated";

export type Student = {
  id: string;
  code: string;
  fullName: string;
  gender: MockGender;
  dateOfBirth: string;
  email: string;
  phone: string;
  faculty: string;
  majorCode: string;
  majorName: string;
  cohort: number;
  className: string;
  status: StudentStatus;
  hometown: string;
};

// Ngành trong danh mục (đọc từ curriculum), page truyền xuống cho ô chọn ngành.
export type MajorRef = {
  code: string;
  name: string;
  faculty: string;
};

// Lớp sinh hoạt đã có, dùng gợi ý tên lớp khi thêm sinh viên.
export type ClassRef = {
  code: string;
  majorCode: string;
  cohort: number;
};

export type LecturerStatus = "active" | "on-leave";

export type Lecturer = {
  id: string;
  code: string;
  fullName: string;
  title: string;
  displayName: string;
  gender: MockGender;
  faculty: string;
  email: string;
  phone: string;
  personalEmail: string;
  office: string;
  officeHours: string;
  status: LecturerStatus;
  isAdvisor: boolean;
  roles: string[];
};

export type AdvisorAssignment = {
  className: string;
  faculty: string;
  majorName: string;
  cohort: number;
  studentCount: number;
  advisorId: string | null;
  advisorName: string | null;
};

export type StudentFormValues = {
  code: string;
  fullName: string;
  gender: MockGender;
  dateOfBirth: string;
  email: string;
  phone: string;
  majorCode: string;
  cohort: number;
  className: string;
  status: StudentStatus;
};

export type LecturerFormValues = {
  code: string;
  fullName: string;
  gender: MockGender;
  title: string;
  faculty: string;
  email: string;
  phone: string;
  status: LecturerStatus;
};

export type DecisionKind = "reserve" | "resume" | "suspend" | "expel" | "major-change" | "reward" | "discipline" | "graduate";

export type DecisionStatus = "draft" | "pending-signature" | "signed" | "revoked";

export type StudentDecision = {
  id: string;
  number: string | null;
  kind: DecisionKind;
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  faculty: string;
  title: string;
  effectiveDate: string;
  signedBy: string | null;
  signedAt: string | null;
  status: DecisionStatus;
  basis: string;
};

// Tài khoản đăng nhập của một hồ sơ: chưa cấp, đã cấp nhưng chưa từng đăng nhập, đang dùng, bị khóa.
export type AccountStatus = "none" | "pending" | "active" | "locked";

export type AccountState = {
  status: AccountStatus;
  lastSignInAt: string | null;
};

export type AccountKind = "student" | "lecturer";

// Kết quả một thao tác tài khoản hàng loạt: trạng thái mới theo id hồ sơ, số dòng bị bỏ qua kèm lý do.
export type AccountBatchResult = {
  accounts: Record<string, AccountState>;
  changed: number;
  // Số thư kích hoạt đã xếp hàng gửi; thư lỗi được gửi lại tự động, xem ở trang Hàng đợi thư.
  mailed: number;
  skipped: { id: string; name: string; reason: string }[];
};

export type StaffFormValues = {
  code: string;
  fullName: string;
  unit: string;
  email: string;
  provisionAccount: boolean;
};

export type MailOutcome = { queued: number };

export type SavedProfile<T> = {
  profile: T;
  account: AccountState;
  // Thư kích hoạt khi vừa cấp tài khoản; null nếu lần lưu này không cấp.
  mail: MailOutcome | null;
};
