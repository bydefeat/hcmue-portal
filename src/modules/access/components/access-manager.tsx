"use client";

import { Tabs } from "antd";
import type { Role, RoleAssignment } from "@/modules/access/access.type";
import { RoleAssignmentTable } from "@/modules/access/components/role-assignment-table";
import { RolePermissionMatrix, type RoleRow } from "@/modules/access/components/role-permission-matrix";
import { TABS_MORE } from "@/shared/constants/antd.constant";

type AccessManagerProps = {
  roles: RoleRow[];
  assignments: RoleAssignment[];
  faculties: string[];
  currentUserId: string;
  viewerName: string;
};

export function AccessManager({ roles, assignments, faculties, currentUserId, viewerName }: AccessManagerProps) {
  const plainRoles: Role[] = roles;
  return (
    <Tabs
      more={TABS_MORE}
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
            />
          ),
        },
      ]}
    />
  );
}
