import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden } from "next/navigation";
import { and, asc, count, desc, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { alias, type PgSelect } from "drizzle-orm/pg-core";
import { db } from "@/shared/libs/db.lib";
import { requireRole } from "@/modules/authentication/authentication.query";
import { ACTIVE_ASSIGNMENT_COOKIE, can } from "@/modules/access/access.constant";
import { roleVisibleTo } from "@/modules/access/access.rule";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { user as users } from "@/modules/authentication/authentication.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { lecturers, staffMembers } from "@/modules/users/users.schema";
import type { GrantCandidate, Permission, RoleAssignment, RoleRow, Viewer } from "@/modules/access/access.type";

const grantor = alias(users, "grantor");
const lecturerFaculty = alias(faculties, "lecturer_faculty");

// Người quản lý phân quyền theo khoa chỉ thấy vai trò theo khoa, số người tính trong khoa của mình.
export async function getRoles(): Promise<RoleRow[]> {
  const viewer = await requirePermission("access.manage");
  const [rows, permissions, members] = await Promise.all([
    db.select().from(roles).orderBy(desc(roles.isSystem), asc(roles.name)),
    db.select().from(rolePermissions),
    db
      .select({ roleId: roleAssignments.roleId, total: count() })
      .from(roleAssignments)
      .leftJoin(faculties, eq(faculties.id, roleAssignments.facultyId))
      .where(viewer.faculty === null ? undefined : eq(faculties.name, viewer.faculty))
      .groupBy(roleAssignments.roleId),
  ]);
  const memberCountOf = new Map(members.map((entry) => [entry.roleId, entry.total]));
  return rows.filter((role) => roleVisibleTo(viewer, role)).map((role) => ({
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

// Khoa của tài khoản: giảng viên theo khoa của hồ sơ, cán bộ khi đơn vị ghi đúng tên khoa (văn phòng khoa).
const accountFaculty = sql<string | null>`coalesce(${lecturerFaculty.name}, (SELECT ${faculties.name} FROM ${faculties} WHERE ${faculties.name} = ${staffMembers.unit}))`;

function withAccountInfo<T extends PgSelect>(query: T) {
  return query
    .leftJoin(staffMembers, eq(staffMembers.userId, users.id))
    .leftJoin(lecturers, eq(lecturers.userId, users.id))
    .leftJoin(lecturerFaculty, eq(lecturerFaculty.id, lecturers.facultyId));
}

export async function getRoleAssignments(id?: string): Promise<RoleAssignment[]> {
  const viewer = await requirePermission("access.manage");
  const conditions: SQL[] = [];
  if (id) conditions.push(eq(roleAssignments.id, id));
  if (viewer.faculty !== null) conditions.push(eq(faculties.name, viewer.faculty));
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
      .where(and(...conditions))
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
// Người quản lý theo khoa chỉ thấy cán bộ, giảng viên thuộc khoa mình; không ai thấy chính mình (không tự cấp quyền).
export async function getGrantCandidates(): Promise<GrantCandidate[]> {
  const viewer = await requirePermission("access.manage");
  const rows = await withAccountInfo(db.select({ ...accountColumns, faculty: accountFaculty }).from(users).$dynamic())
    .where(or(isNotNull(staffMembers.id), isNotNull(lecturers.id)))
    .orderBy(asc(users.name));
  return rows.filter((row) => row.userId !== viewer.id && (viewer.faculty === null || row.faculty === viewer.faculty)).map(({ faculty: _faculty, ...row }) => row);
}

// Khoa của tài khoản được cấp quyền, để kiểm người theo khoa chỉ cấp cho người thuộc khoa mình.
export async function accountFacultyOf(userId: string) {
  const [row] = await withAccountInfo(db.select({ faculty: accountFaculty }).from(users).$dynamic()).where(eq(users.id, userId));
  return row?.faculty ?? null;
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

// Thao tác trên dữ liệu chung toàn trường (đợt đăng ký, phòng học, quy chế, lịch năm học, thông báo chung, danh mục đào tạo):
// vai trò theo khoa dù được cấp quyền cũng không làm được, để không tác động sang khoa khác.
export async function requireSchoolWidePermission(permission: Permission) {
  const viewer = await requirePermission(permission);
  if (viewer.faculty) forbidden();
  return viewer;
}
