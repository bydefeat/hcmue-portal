export type Permission =
  | "dashboard.view"
  | "announcements.manage"
  | "requests.process"
  | "requests.step.faculty"
  | "requests.step.academic-office"
  | "requests.step.exam-office"
  | "requests.supervise"
  | "curriculum.manage"
  | "class-sections.manage"
  | "teaching.assign"
  | "facilities.manage"
  | "registration.manage"
  | "grades.approve"
  | "grades.publish"
  | "decisions.manage"
  | "graduation.manage"
  | "exams.manage"
  | "tuition.manage"
  | "students.view"
  | "students.manage"
  | "lecturers.manage"
  | "advisors.assign"
  | "reports.view"
  | "surveys.view"
  | "settings.manage"
  | "access.manage"
  | "audit.view";

export type RoleScope = "university" | "faculty";

export type Role = {
  id: string;
  name: string;
  description: string;
  scope: RoleScope;
  permissions: Permission[];
  isSystem: boolean;
};

export type RoleRow = Role & { memberCount: number };

export type GrantCandidate = {
  userId: string;
  name: string;
  code: string;
  unit: string;
};

export type RoleAssignment = {
  id: string;
  userId: string;
  userName: string;
  userCode: string;
  unit: string;
  roleId: string;
  faculty: string | null;
  grantedAt: string;
  grantedBy: string;
};

export type Viewer = {
  id: string;
  name: string;
  code: string;
  roleId: string;
  roleKey: string | null;
  roleName: string;
  unit: string | null;
  faculty: string | null;
  permissions: Permission[];
  assignmentId: string | null;
};
