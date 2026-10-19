import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { mockDelay } from "@/shared/libs/mock-request.lib";
import { requireRole } from "@/modules/authentication/authentication.query";
import { ACTIVE_ASSIGNMENT_COOKIE, can } from "@/modules/access/access.constant";
import { ROLE_ASSIGNMENTS, ROLES } from "@/modules/access/access.mock";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { user as users } from "@/modules/authentication/authentication.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { staffMembers } from "@/modules/users/users.schema";
import type { Permission, Viewer } from "@/modules/access/access.type";

export async function getRoles() {
  await mockDelay();
  return ROLES.map((role) => ({
    ...role,
    memberCount: ROLE_ASSIGNMENTS.filter((assignment) => assignment.roleId === role.id).length,
  }));
}

export async function getRoleAssignments() {
  await mockDelay();
  return ROLE_ASSIGNMENTS;
}

export type ViewerAssignment = {
  id: string;
  roleId: string;
  roleKey: string | null;
  roleName: string;
  grantedAt: Date;
  grantedBy: string | null;
  scope: "university" | "faculty";
  faculty: string | null;
  permissions: Permission[];
};

// Các vai trò quản trị được cấp cho tài khoản đang đăng nhập, kèm quyền của từng vai trò.
const grantor = alias(users, "grantor");

export const getViewerAssignments = cache(async (userId: string): Promise<ViewerAssignment[]> => {
  const rows = await db
    .select({
      id: roleAssignments.id,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
      grantedAt: roleAssignments.grantedAt,
      grantedBy: grantor.name,
      scope: roles.scope,
      faculty: faculties.name,
      permission: rolePermissions.permission,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .leftJoin(faculties, eq(faculties.id, roleAssignments.facultyId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(grantor, eq(grantor.id, roleAssignments.grantedByUserId))
    .where(eq(roleAssignments.userId, userId))
    .orderBy(asc(roleAssignments.grantedAt));
  const byId = new Map<string, ViewerAssignment>();
  for (const row of rows) {
    const { permission, ...assignment } = row;
    const entry = byId.get(row.id) ?? { ...assignment, permissions: [] };
    if (permission) entry.permissions.push(permission);
    byId.set(row.id, entry);
  }
  return [...byId.values()];
});

// Người đang xem cổng quản trị. Có nhiều vai trò thì dùng vai trò chọn gần nhất (cookie), chỉ trong số vai trò của chính tài khoản đó.
export const getViewer = cache(async (): Promise<Viewer> => {
  const { user } = await requireRole("admin");
  const [assignments, cookieStore, [staff]] = await Promise.all([
    getViewerAssignments(user.id),
    cookies(),
    db.select({ unit: staffMembers.unit, code: staffMembers.code }).from(staffMembers).where(eq(staffMembers.userId, user.id)).limit(1),
  ]);
  const activeId = cookieStore.get(ACTIVE_ASSIGNMENT_COOKIE)?.value;
  const active = assignments.find((assignment) => assignment.id === activeId) ?? assignments[0];
  const faculty = active?.scope === "faculty" ? active.faculty : null;
  return {
    id: user.id,
    name: user.name,
    code: staff?.code ?? user.username ?? user.email,
    roleId: active?.roleId ?? "",
    roleKey: active?.roleKey ?? null,
    roleName: active ? (faculty ? `${active.roleName}, ${faculty}` : active.roleName) : "Chưa được phân quyền",
    unit: staff?.unit ?? null,
    faculty,
    permissions: active?.permissions ?? [],
    assignmentId: active?.id ?? null,
  };
});

// Gọi ở dòng đầu mỗi trang và mỗi server action của cổng quản trị.
export async function requirePermission(permission: Permission) {
  const viewer = await getViewer();
  if (!can(viewer, permission)) forbidden();
  return viewer;
}
