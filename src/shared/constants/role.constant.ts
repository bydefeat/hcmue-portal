export type AppRole = "student" | "lecturer" | "advisor" | "admin";

export const ROLE_LABEL: Record<AppRole, string> = {
  student: "Sinh viên",
  lecturer: "Giảng viên",
  advisor: "Cố vấn học tập",
  admin: "Phòng Đào tạo",
};

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/administrator",
  lecturer: "/lecturer",
  advisor: "/lecturer",
  student: "/application/dashboard",
};

export const ROLE_PRIORITY: AppRole[] = ["admin", "lecturer", "advisor", "student"];

export function landingOf(roles: AppRole[]) {
  const role = ROLE_PRIORITY.find((entry) => roles.includes(entry)) ?? "student";
  return ROLE_HOME[role];
}

export const DEMO_ACCOUNTS: { username: string; roles: AppRole[]; label: string }[] = [
  { username: "5001104009", roles: ["student"], label: "Sinh viên" },
  { username: "GV104011", roles: ["lecturer", "advisor"], label: "Giảng viên, cố vấn" },
  { username: "PDT0001", roles: ["admin"], label: "Phòng Đào tạo" },
];

export function demoRolesOf(username: string): AppRole[] {
  const normalized = username.trim().toUpperCase();
  const account = DEMO_ACCOUNTS.find((entry) => entry.username.toUpperCase() === normalized);
  if (account) return account.roles;
  if (/^(PDT|CB|PKT|BGH|GVK)/.test(normalized) || normalized.startsWith("ADMIN")) return ["admin"];
  if (normalized.startsWith("GV") || normalized.endsWith("@HCMUE.EDU.VN")) return ["lecturer"];
  return ["student"];
}
