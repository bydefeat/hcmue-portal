"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { parseRoles } from "@/shared/constants/role.constant";
import { requireRole } from "@/modules/authentication/authentication.query";
import { user as users } from "@/modules/authentication/authentication.schema";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { ACCESS_CONSTRAINT_MESSAGE, ACTIVE_ASSIGNMENT_COOKIE, PERMISSION_LABEL } from "@/modules/access/access.constant";
import { accountFacultyOf, getRoleAssignments, getViewerAssignments, requirePermission } from "@/modules/access/access.query";
import {
  GRANT_ROLE_SCHEMA,
  grantBlockedReason,
  isPrivilegedRole,
  revokeBlockedReason,
  ROLE_PERMISSIONS_SCHEMA,
  rolePermissionsBlockedReason,
  SYSTEM_ADMIN_ROLE_KEY,
  type GrantRoleInput,
} from "@/modules/access/access.rule";
import { roleAssignments, rolePermissions, roles } from "@/modules/access/access.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { lecturers, staffMembers } from "@/modules/users/users.schema";
import type { Permission, RoleAssignment } from "@/modules/access/access.type";

const switchSchema = z.object({ assignmentId: z.uuid() });

class AccessError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function failure(error: unknown) {
  if (error instanceof AccessError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, ACCESS_CONSTRAINT_MESSAGE);
}

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

async function lockRole(tx: Transaction, roleId: string) {
  const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).for("update");
  if (!role) return null;
  const permissions = await tx.select({ permission: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  return { ...role, permissions: permissions.map((entry) => entry.permission) };
}

export async function saveRolePermissions(roleId: string, permissions: Permission[]): Promise<ActionResult<Permission[]>> {
  const viewer = await requirePermission("access.manage");
  const parsed = parseInput(ROLE_PERMISSIONS_SCHEMA, { roleId, permissions });
  if (!parsed.ok) return parsed;
  const next = parsed.data.permissions as Permission[];
  try {
    const saved = await db.transaction(async (tx) => {
      const role = await lockRole(tx, parsed.data.roleId);
      if (!role) throw new AccessError("Vai trò không còn tồn tại, tải lại trang.");
      const blocked = rolePermissionsBlockedReason(viewer, role, next);
      if (blocked) throw new AccessError(blocked);
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      await tx.insert(rolePermissions).values(next.map((permission) => ({ roleId: role.id, permission })));
      const added = next.filter((permission) => !role.permissions.includes(permission));
      const removed = role.permissions.filter((permission) => !next.includes(permission));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "permission",
        entityType: "role",
        entityId: role.id,
        entityLabel: role.name,
        summary: `Sửa quyền của vai trò ${role.name}: thêm ${added.length}, bỏ ${removed.length} quyền`,
        changes: [
          ...added.map((permission) => ({ field: PERMISSION_LABEL[permission], before: "Không", after: "Có" })),
          ...removed.map((permission) => ({ field: PERMISSION_LABEL[permission], before: "Có", after: "Không" })),
        ],
      });
      return next;
    });
    revalidatePath("/administrator", "layout");
    return actionOk(saved);
  } catch (error) {
    return failure(error);
  }
}

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
  const { userId, roleId } = parsed.data;
  let assignmentId: string;
  try {
    const targetFaculty = await accountFacultyOf(userId);
    assignmentId = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ name: users.name, role: users.role, staffId: staffMembers.id, staffCode: staffMembers.code, lecturerId: lecturers.id, lecturerCode: lecturers.code })
        .from(users)
        .leftJoin(staffMembers, eq(staffMembers.userId, users.id))
        .leftJoin(lecturers, eq(lecturers.userId, users.id))
        .where(eq(users.id, userId));
      if (!target) throw new AccessError("Tài khoản không còn tồn tại, tải lại trang.", "userId");
      if (parseRoles(target.role).includes("student") || (!target.staffId && !target.lecturerId)) {
        throw new AccessError("Chỉ cấp vai trò quản trị cho tài khoản của cán bộ hoặc giảng viên.", "userId");
      }
      const role = await lockRole(tx, roleId);
      if (!role) throw new AccessError("Vai trò không còn tồn tại, tải lại trang.", "roleId");
      const faculty = role.scope === "faculty" ? (parsed.data.faculty ?? null) : null;
      const blocked = grantBlockedReason(viewer, role, { userId, faculty, targetFaculty });
      if (blocked) throw new AccessError(blocked, userId === viewer.id ? "userId" : "roleId");
      let facultyId: string | null = null;
      if (role.scope === "faculty") {
        const [row] = faculty ? await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty)) : [];
        if (!row) throw new AccessError("Vai trò theo khoa cần chọn khoa.", "faculty");
        facultyId = row.id;
      }
      const [row] = await tx.insert(roleAssignments).values({ userId, roleId, facultyId, grantedByUserId: viewer.id }).returning({ id: roleAssignments.id });
      await syncAdminRole(tx, userId);
      const code = target.staffCode ?? target.lecturerCode ?? "";
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "permission",
        entityType: "role",
        entityId: row.id,
        entityLabel: `${code} ${target.name}`.trim(),
        summary: `Cấp vai trò ${role.name}${faculty ? `, ${faculty}` : ""} cho ${target.name}`,
        changes: [{ field: "Vai trò", before: "", after: faculty ? `${role.name}, ${faculty}` : role.name }],
      });
      return row.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/settings/access");
  revalidatePath("/administrator/users/staff");
  const [assignment] = await getRoleAssignments(assignmentId);
  return assignment ? actionOk(assignment) : actionError("Đã cấp quyền nhưng chưa đọc lại được, tải lại trang.");
}

export async function revokeRole(assignmentId: string): Promise<ActionResult> {
  const viewer = await requirePermission("access.manage");
  if (!isUuid(assignmentId)) return actionError("Phân quyền không còn tồn tại, tải lại trang.");
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ userId: roleAssignments.userId, roleId: roleAssignments.roleId, faculty: faculties.name, userName: users.name })
        .from(roleAssignments)
        .innerJoin(users, eq(users.id, roleAssignments.userId))
        .leftJoin(faculties, eq(faculties.id, roleAssignments.facultyId))
        .where(eq(roleAssignments.id, assignmentId))
        .for("update", { of: roleAssignments });
      if (!row) throw new AccessError("Phân quyền đã được thu hồi trước đó.");
      const role = await lockRole(tx, row.roleId);
      if (!role) throw new AccessError("Vai trò không còn tồn tại, tải lại trang.");
      const blocked = revokeBlockedReason(viewer, role, row);
      if (blocked) throw new AccessError(blocked);
      if (role.key === SYSTEM_ADMIN_ROLE_KEY) {
        const [{ others }] = await tx
          .select({ others: count() })
          .from(roleAssignments)
          .where(and(eq(roleAssignments.roleId, role.id), ne(roleAssignments.id, assignmentId)));
        if (others === 0) throw new AccessError("Đây là người quản trị hệ thống cuối cùng. Cấp vai trò này cho người khác trước khi thu hồi.");
      }
      await tx.delete(roleAssignments).where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.userId, row.userId)));
      await syncAdminRole(tx, row.userId);
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "permission",
        entityType: "role",
        entityId: assignmentId,
        entityLabel: row.userName,
        summary: `Thu hồi vai trò ${role.name}${row.faculty ? `, ${row.faculty}` : ""} của ${row.userName}${isPrivilegedRole(role) ? " (vai trò quản trị cao)" : ""}`,
        changes: [{ field: "Vai trò", before: row.faculty ? `${role.name}, ${row.faculty}` : role.name, after: "" }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/settings/access");
  revalidatePath("/administrator/users/staff");
  return actionOk();
}
