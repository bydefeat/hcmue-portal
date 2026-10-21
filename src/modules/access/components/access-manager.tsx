"use client";

import { Tabs } from "antd";
import type { GrantCandidate, Permission, Role, RoleAssignment, RoleRow } from "@/modules/access/access.type";
import { RoleAssignmentTable } from "@/modules/access/components/role-assignment-table";
import { RolePermissionMatrix } from "@/modules/access/components/role-permission-matrix";
import { TABS_MORE } from "@/shared/constants/antd.constant";

type AccessManagerProps = {
  roles: RoleRow[];
  assignments: RoleAssignment[];
  faculties: string[];
  candidates: GrantCandidate[];
  currentUserId: string;
  viewer: { faculty: string | null; permissions: Permission[] };
};

export function AccessManager({ roles, assignments, faculties, candidates, currentUserId, viewer }: AccessManagerProps) {
  const plainRoles: Role[] = roles;
  return (
    <Tabs
      more={TABS_MORE}
      items={[
        { key: "roles", label: "Vai trò và quyền", children: <RolePermissionMatrix roles={roles} viewer={viewer} /> },
        {
          key: "assignments",
          label: `Cán bộ được cấp quyền (${assignments.length})`,
          children: (
            <RoleAssignmentTable
              assignments={assignments}
              roles={plainRoles}
              faculties={faculties}
              candidates={candidates}
              currentUserId={currentUserId}
              viewerFaculty={viewer.faculty}
            />
          ),
        },
      ]}
    />
  );
}
