"use client";

import { Tabs } from "antd";
import type { Role, RoleAssignment } from "../access.type";
import { RoleAssignmentTable } from "./role-assignment-table";
import { RolePermissionMatrix, type RoleRow } from "./role-permission-matrix";

type AccessManagerProps = {
  roles: RoleRow[];
  assignments: RoleAssignment[];
  faculties: string[];
  currentUserId: string;
  viewerName: string;
  switchAction: (formData: FormData) => void | Promise<void>;
};

export function AccessManager({ roles, assignments, faculties, currentUserId, viewerName, switchAction }: AccessManagerProps) {
  const plainRoles: Role[] = roles;
  return (
    <Tabs
      items={[
        { key: "roles", label: "Vai trò và quyền", children: <RolePermissionMatrix roles={roles} /> },
        {
          key: "assignments",
          label: `Cán bộ được cấp quyền (${assignments.length})`,
          children: (
            <RoleAssignmentTable
              assignments={assignments}
              roles={plainRoles}
              faculties={faculties}
              currentUserId={currentUserId}
              viewerName={viewerName}
              switchAction={switchAction}
            />
          ),
        },
      ]}
    />
  );
}
