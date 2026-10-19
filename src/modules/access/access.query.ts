import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden } from "next/navigation";
import { asc, count, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { alias, type PgSelect } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { requireRole } from "@/modules/authentication/authentication.query";
import { ACTIVE_ASSIGNMENT_COOKIE, can } from "@/modules/access/access.constant";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { user as users } from "@/modules/authentication/authentication.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { lecturers, staffMembers } from "@/modules/users/users.schema";
import type { GrantCandidate, Permission, RoleAssignment, RoleRow, Viewer } from "@/modules/access/access.type";

const grantor = alias(users, "grantor");
const lecturerFaculty = alias(faculties, "lecturer_faculty");

export async function getRoles(): Promise<RoleRow[]> {
  await requirePermission("access.manage");
  const [rows, permissions, members] = await Promise.all([
    db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name)),
    db.select().from(rolePermissions),
    db.select({ roleId: roleAssignments.roleId, total: count() }).from(roleAssignments).groupBy(roleAssignments.roleId),
  ]);
  const memberCountOf = new Map(members.map((entry) => [entry.roleId, entry.total]));
  return rows.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    scope: role.scope,
    isSystem: role.isSystem,
    permissions: permissions.filter((entry) => entry.roleId === role.id).map((entry) => entry.permission),
    memberCount: memberCountOf.get(role.id) ?? 0,
  }));
}

// Mã và đơn vị của tài khoản: cán bộ lấy từ staff_members, giảng viên lấy mã GV và khoa.
const accountColumns = {
  userId: users.id,
  name: users.name,
  code: sql<string>`coalesce(${staffMembers.code}, ${lecturers.code}, ${users.email})`,
  unit: sql<string>`coalesce(${staffMembers.unit}, ${lecturerFaculty.name}, '')`,
};

function withAccountInfo<T extends PgSelect>(query: T) {
  return query
    .leftJoin(staffMembers, eq(staffMembers.userId, users.id))
    .leftJoin(lecturers, eq(lecturers.userId, users.id))
    .leftJoin(lecturerFaculty, eq(lecturerFaculty.id, lecturers.facultyId));
}

export async function getRoleAssignments(id?: string): Promise<RoleAssignment[]> {
  await requirePermission("access.manage");
  const rows = await withAccountInfo(
    db
      .select({
        id: roleAssignments.id,
        ...accountColumns,
        roleId: roleAssignments.roleId,
        faculty: faculties.name,
        grantedAt: roleAssignments.grantedAt,
        grantedBy: grantor.name,
      })
      .from(roleAssignments)
      .innerJoin(users, eq(users.id, roleAssignments.userId))
      .leftJoin(faculties, eq(faculties.id, roleAssignments.facultyId))
      .leftJoin(grantor, eq(grantor.id, roleAssignments.grantedByUserId))
      .where(id ? eq(roleAssignments.id, id) : undefined)
      .orderBy(desc(roleAssignments.grantedAt))
      .$dynamic(),
  );
  return rows.map(({ name, code, grantedAt, grantedBy, ...row }) => ({
    ...row,
    userName: name,
    userCode: code,
    grantedAt: grantedAt.toISOString(),
    grantedBy: grantedBy ?? "Hệ thống",
  }));
}

// Tài khoản được cấp vai trò quản trị: cán bộ và giảng viên đã có tài khoản đăng nhập. Sinh viên không được cấp.
export async function getGrantCandidates(): Promise<GrantCandidate[]> {
  await requirePermission("access.manage");
  const rows = await withAccountInfo(db.select(accountColumns).from(users).$dynamic())
    .where(or(isNotNull(staffMembers.id), isNotNull(lecturers.id)))
    .orderBy(asc(users.name));
  return rows;
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
    .orderBy(asc(roleAssignments.grantedAt), asc(roleAssignments.id));
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
