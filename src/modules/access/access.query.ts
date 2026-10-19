import { cookies } from "next/headers";
import { forbidden } from "next/navigation";
import { mockDelay } from "@/shared/libs/mock-request.lib";
import { can, DEMO_ROLE_COOKIE } from "@/modules/access/access.constant";
import { DEFAULT_DEMO_ASSIGNMENT_ID, ROLE_ASSIGNMENTS, ROLES } from "@/modules/access/access.mock";
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

export async function getViewer(): Promise<Viewer> {
  const cookieStore = await cookies();
  const assignmentId = cookieStore.get(DEMO_ROLE_COOKIE)?.value ?? DEFAULT_DEMO_ASSIGNMENT_ID;
  const assignment =
    ROLE_ASSIGNMENTS.find((entry) => entry.id === assignmentId) ?? ROLE_ASSIGNMENTS.find((entry) => entry.id === DEFAULT_DEMO_ASSIGNMENT_ID)!;
  const role = ROLES.find((entry) => entry.id === assignment.roleId)!;
  return {
    id: assignment.userId,
    name: assignment.userName,
    code: assignment.userCode,
    roleId: role.id,
    roleName: assignment.faculty ? `${role.name}, ${assignment.faculty}` : role.name,
    faculty: role.scope === "faculty" ? assignment.faculty : null,
    permissions: role.permissions,
  };
}

export async function requirePermission(permission: Permission) {
  const viewer = await getViewer();
  if (!can(viewer, permission)) forbidden();
  return viewer;
}
