"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { parseRoles } from "@/shared/constants/role.constant";
import { requireRole } from "@/modules/authentication/authentication.query";
import { user as users } from "@/modules/authentication/authentication.schema";
import { ACCESS_CONSTRAINT_MESSAGE, ACTIVE_ASSIGNMENT_COOKIE } from "@/modules/access/access.constant";
import { getRoleAssignments, getViewerAssignments, requirePermission } from "@/modules/access/access.query";
import { GRANT_ROLE_SCHEMA, ROLE_PERMISSIONS_SCHEMA, type GrantRoleInput } from "@/modules/access/access.rule";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import type { Permission, RoleAssignment } from "@/modules/access/access.type";

const switchSchema = z.object({ assignmentId: z.uuid() });

// Đổi vai trò đang dùng khi một tài khoản được cấp nhiều vai trò quản trị.
export async function switchActiveRole(formData: FormData) {
  const { user } = await requireRole("admin");
  const parsed = switchSchema.safeParse({ assignmentId: formData.get("assignmentId") });
  if (!parsed.success) return;
  const assignments = await getViewerAssignments(user.id);
  if (!assignments.some((assignment) => assignment.id === parsed.data.assignmentId)) return;
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ASSIGNMENT_COOKIE, parsed.data.assignmentId, { path: "/administrator", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect("/administrator");
}

export async function saveRolePermissions(roleId: string, permissions: Permission[]): Promise<ActionResult<Permission[]>> {
  await requirePermission("access.manage");
  const parsed = parseInput(ROLE_PERMISSIONS_SCHEMA, { roleId, permissions });
  if (!parsed.ok) return parsed;
  try {
    const saved = await db.transaction(async (tx) => {
      const [role] = await tx.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.id, parsed.data.roleId)).for("update");
      if (!role) return "missing" as const;
      if (role.isSystem) return "system" as const;
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, parsed.data.roleId));
      await tx.insert(rolePermissions).values(parsed.data.permissions.map((permission) => ({ roleId: parsed.data.roleId, permission: permission as Permission })));
      return parsed.data.permissions as Permission[];
    });
    if (saved === "missing") return actionError("Vai trò không còn tồn tại, tải lại trang.");
    if (saved === "system") return actionError("Vai trò hệ thống không sửa quyền được.");
    revalidatePath("/administrator", "layout");
    return actionOk(saved);
  } catch (error) {
    return actionFailure(error, ACCESS_CONSTRAINT_MESSAGE);
  }
}

// Giữ user.role khớp với role_assignments: còn ít nhất một vai trò quản trị thì có "admin", hết thì bỏ.
async function syncAdminRole(tx: Transaction, userId: string) {
  const [[account], [{ total }]] = await Promise.all([
    tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).for("update"),
    tx.select({ total: count() }).from(roleAssignments).where(eq(roleAssignments.userId, userId)),
  ]);
  if (!account) return;
  const others = parseRoles(account.role).filter((role) => role !== "admin");
  const next = total > 0 ? [...others, "admin"] : others;
  await tx
    .update(users)
    .set({ role: next.join(",") || null })
    .where(eq(users.id, userId));
}

export async function grantRole(input: GrantRoleInput): Promise<ActionResult<RoleAssignment>> {
  const viewer = await requirePermission("access.manage");
  const parsed = parseInput(GRANT_ROLE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { userId, roleId, faculty } = parsed.data;
  let assignmentId: string;
  try {
    const result = await db.transaction(async (tx) => {
      const [role] = await tx.select({ scope: roles.scope }).from(roles).where(eq(roles.id, roleId));
      if (!role) return actionError("Vai trò không còn tồn tại, tải lại trang.", { roleId: "Vai trò không còn tồn tại" });
      let facultyId: string | null = null;
      if (role.scope === "faculty") {
        const [row] = faculty ? await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty)) : [];
        if (!row) return actionError("Vai trò theo khoa cần chọn khoa.", { faculty: "Vai trò theo khoa cần chọn khoa" });
        facultyId = row.id;
      }
      const [row] = await tx.insert(roleAssignments).values({ userId, roleId, facultyId, grantedByUserId: viewer.id }).returning({ id: roleAssignments.id });
      await syncAdminRole(tx, userId);
      return row.id;
    });
    if (typeof result !== "string") return result;
    assignmentId = result;
  } catch (error) {
    return actionFailure(error, ACCESS_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/administrator/settings/access");
  const [assignment] = await getRoleAssignments(assignmentId);
  return assignment ? actionOk(assignment) : actionError("Đã cấp quyền nhưng chưa đọc lại được, tải lại trang.");
}

export async function revokeRole(assignmentId: string): Promise<ActionResult> {
  const viewer = await requirePermission("access.manage");
  if (!isUuid(assignmentId)) return actionError("Phân quyền không còn tồn tại, tải lại trang.");
  try {
    const revoked = await db.transaction(async (tx) => {
      const [row] = await tx.select({ userId: roleAssignments.userId }).from(roleAssignments).where(eq(roleAssignments.id, assignmentId)).for("update");
      if (!row) return "missing" as const;
      // Không tự thu hồi quyền của mình, tránh khoá luôn người đang quản trị.
      if (row.userId === viewer.id) return "self" as const;
      await tx.delete(roleAssignments).where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.userId, row.userId)));
      await syncAdminRole(tx, row.userId);
      return "ok" as const;
    });
    if (revoked === "missing") return actionError("Phân quyền đã được thu hồi trước đó.");
    if (revoked === "self") return actionError("Không thu hồi quyền của chính mình. Nhờ cán bộ quản trị khác thực hiện.");
  } catch (error) {
    return actionFailure(error, ACCESS_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/administrator/settings/access");
  return actionOk();
}
