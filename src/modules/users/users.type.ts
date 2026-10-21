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

export type MajorRef = {
  code: string;
  name: string;
  faculty: string;
};

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
  targetClassName: string | null;
  targetMajorName: string | null;
  appliedAt: string | null;
  createdByUserId: string | null;
  returnReason: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
};

export type AccountStatus = "none" | "pending" | "active" | "locked";

export type AccountState = {
  status: AccountStatus;
  lastSignInAt: string | null;
};

export type AccountKind = "student" | "lecturer" | "staff";

export type AccountBatchResult = {
  accounts: Record<string, AccountState>;
  changed: number;
  mailed: number;
  skipped: { id: string; name: string; reason: string }[];
};

export type StaffFormValues = {
  code: string;
  fullName: string;
  unit: string;
  email: string;
  provisionAccount: boolean;
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
  mail: MailOutcome | null;
};
