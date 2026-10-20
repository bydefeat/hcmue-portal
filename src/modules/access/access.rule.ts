import { z } from "zod";
import { ALL_PERMISSIONS, PERMISSION_LABEL } from "@/modules/access/access.constant";
import type { Permission, RoleScope, Viewer } from "@/modules/access/access.type";

export const ROLE_PERMISSIONS_SCHEMA = z.object({
  roleId: z.uuid(),
  permissions: z
    .array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))
    .min(1, "Vai trò cần ít nhất một quyền")
    .transform((permissions) => [...new Set(permissions)]),
});

export const GRANT_ROLE_SCHEMA = z.object({
  userId: z.uuid("Chưa chọn cán bộ"),
  roleId: z.uuid("Chưa chọn vai trò"),
  faculty: z.string().trim().optional(),
});

export type GrantRoleInput = z.input<typeof GRANT_ROLE_SCHEMA>;

export const SYSTEM_ADMIN_ROLE_KEY = "system-admin";

// Quyền chỉ có nghĩa ở phạm vi toàn trường (dữ liệu chung, cấu hình, phân quyền): vai trò theo khoa không được thêm.
export const SCHOOL_WIDE_PERMISSIONS: Permission[] = [
  "access.manage",
  "settings.manage",
  "audit.view",
  "announcements.manage",
  "curriculum.manage",
  "facilities.manage",
  "grades.publish",
  "tuition.manage",
  "decisions.sign",
];

type RoleLike = { scope: RoleScope; isSystem: boolean; permissions: Permission[] };
type ViewerLike = Pick<Viewer, "faculty" | "permissions" | "roleKey">;

// Vai trò "cao": vai trò hệ thống hoặc có quyền phân quyền. Chỉ quản trị toàn trường cấp, thu hồi được.
export function isPrivilegedRole(role: Pick<RoleLike, "isSystem" | "permissions">) {
  return role.isSystem || role.permissions.includes("access.manage");
}

export function isSystemAdmin(viewer: Pick<Viewer, "roleKey">) {
  return viewer.roleKey === SYSTEM_ADMIN_ROLE_KEY;
}

// Người quản lý phân quyền theo khoa chỉ thấy và làm việc với vai trò theo khoa.
export function roleVisibleTo(viewer: Pick<Viewer, "faculty">, role: Pick<RoleLike, "scope">) {
  return viewer.faculty === null || role.scope === "faculty";
}

function labels(permissions: Permission[]) {
  return permissions.map((permission) => PERMISSION_LABEL[permission].toLowerCase()).join(", ");
}

// Sửa tập quyền của một vai trò; null là được. Vai trò hệ thống không ai sửa.
export function rolePermissionsBlockedReason(viewer: ViewerLike, role: RoleLike, next: Permission[]) {
  if (role.isSystem) return "Vai trò hệ thống không sửa quyền được. Tạo vai trò mới nếu cần một tổ hợp quyền khác.";
  if (viewer.faculty === null) return null;
  if (role.scope !== "faculty") return "Bạn quản lý phân quyền theo khoa nên chỉ sửa được vai trò theo khoa.";
  if (isPrivilegedRole(role)) return "Vai trò này có quyền phân quyền, chỉ quản trị toàn trường sửa được.";
  const added = next.filter((permission) => !role.permissions.includes(permission));
  const schoolWide = added.filter((permission) => SCHOOL_WIDE_PERMISSIONS.includes(permission));
  if (schoolWide.length > 0) return `Vai trò theo khoa không được thêm quyền dùng cho toàn trường: ${labels(schoolWide)}.`;
  const beyond = added.filter((permission) => !viewer.permissions.includes(permission));
  if (beyond.length > 0) return `Bạn không thêm được quyền mà vai trò của bạn không có: ${labels(beyond)}.`;
  return null;
}

// Cấp vai trò; null là được. Không tự cấp cho mình (leo quyền); vai trò cao chỉ quản trị toàn trường cấp;
// người theo khoa chỉ cấp vai trò theo khoa của đúng khoa mình cho người thuộc khoa mình.
export function grantBlockedReason(
  viewer: ViewerLike & { id: string },
  role: RoleLike,
  grant: { userId: string; faculty: string | null; targetFaculty: string | null },
) {
  if (grant.userId === viewer.id) return "Không tự cấp vai trò cho chính mình. Nhờ cán bộ quản trị khác thực hiện.";
  if (isPrivilegedRole(role) && viewer.faculty !== null) return "Vai trò hệ thống hoặc có quyền phân quyền chỉ quản trị toàn trường cấp được.";
  if (viewer.faculty === null) return null;
  if (role.scope !== "faculty" || grant.faculty !== viewer.faculty) return `Bạn chỉ cấp được vai trò theo khoa cho ${viewer.faculty}.`;
  if (grant.targetFaculty !== viewer.faculty) return `Bạn chỉ cấp vai trò cho cán bộ, giảng viên thuộc ${viewer.faculty}.`;
  return null;
}

// Thu hồi; null là được.
export function revokeBlockedReason(viewer: ViewerLike & { id: string }, role: RoleLike, assignment: { userId: string; faculty: string | null }) {
  if (assignment.userId === viewer.id) return "Không thu hồi quyền của chính mình. Nhờ cán bộ quản trị khác thực hiện.";
  if (viewer.faculty !== null && (assignment.faculty !== viewer.faculty || isPrivilegedRole(role))) {
    return "Phân quyền này thuộc khoa khác hoặc toàn trường, bạn không thu hồi được.";
  }
  return null;
}

// Khóa tài khoản đang giữ vai trò quản trị cao hơn người khóa: chỉ quản trị hệ thống làm được,
// để người có quyền quản lý giảng viên không khóa được quản trị hệ thống (giảng viên kiêm quản trị).
export function lockBlockedReason(viewer: ViewerLike, targetRoles: (RoleLike & { name: string })[]) {
  if (isSystemAdmin(viewer)) return null;
  const higher = targetRoles.find((role) => isPrivilegedRole(role) || (viewer.faculty !== null && role.scope === "university"));
  return higher ? `Tài khoản đang giữ vai trò ${higher.name}, chỉ quản trị hệ thống khóa được.` : null;
}
