import type { MockGender } from "@/shared/libs/mock.lib";

export type StudentStatus = "studying" | "reserved" | "suspended" | "graduated" | "withdrawn";

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
  personalEmail: string;
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

// Email trường tự sinh từ MSSV nên form chỉ có email cá nhân; tình trạng học tập đổi bằng quyết định, không sửa ở form.
export type StudentFormValues = {
  code: string;
  fullName: string;
  gender: MockGender;
  dateOfBirth: string;
  personalEmail: string;
  phone: string;
  majorCode: string;
  cohort: number;
  className: string;
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

export type DisciplineLevel = "reprimand" | "warning" | "suspension";

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
  disciplineLevel: DisciplineLevel | null;
  // Chuyển ngành: lớp và ngành đích.
  targetClassName: string | null;
  targetMajorName: string | null;
  // Đã áp dụng vào hồ sơ (tới ngày hiệu lực); ký trước ngày hiệu lực thì null cho tới ngày đó.
  appliedAt: string | null;
  createdByUserId: string | null;
  returnReason: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
};

// Tài khoản đăng nhập của một hồ sơ: chưa cấp, đã cấp nhưng chưa từng đăng nhập, đang dùng, bị khóa.
export type AccountStatus = "none" | "pending" | "active" | "locked";

export type AccountState = {
  status: AccountStatus;
  lastSignInAt: string | null;
};

export type AccountKind = "student" | "lecturer" | "staff";

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
  // Vai trò quản trị cấp ngay khi tạo; bỏ trống thì tài khoản chưa vào được cổng quản trị cho tới khi được cấp vai trò.
  roleId?: string;
  faculty?: string;
};

export type StaffMember = {
  id: string;
  code: string;
  fullName: string;
  unit: string;
  email: string;
  userId: string | null;
  roles: string[];
};

export type MailOutcome = { queued: number };

export type SavedProfile<T> = {
  profile: T;
  account: AccountState;
  // Thư kích hoạt khi vừa cấp tài khoản; null nếu lần lưu này không cấp.
  mail: MailOutcome | null;
};
