import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AccessManager } from "@/modules/access/components/access-manager";
import { getGrantCandidates, getRoleAssignments, getRoles, requirePermission } from "@/modules/access/access.query";
import { getFacultyNames } from "@/modules/curriculum/curriculum.query";
import { StaffCreateButton } from "@/modules/users/components/staff-create-button";

export const metadata: Metadata = { title: "Phân quyền" };

export default async function Page() {
  const viewer = await requirePermission("access.manage");
  const [roles, assignments, faculties, candidates] = await Promise.all([getRoles(), getRoleAssignments(), getFacultyNames(), getGrantCandidates()]);

  return (
    <>
      <PageHeader
        title="Phân quyền"
        description="Mỗi vai trò là một tập quyền. Vai trò theo khoa chỉ thấy dữ liệu của khoa được chỉ định."
        actions={viewer.faculty === null ? <StaffCreateButton /> : undefined}
      />
      <AccessManager
        roles={roles}
        assignments={assignments}
        faculties={faculties}
        candidates={candidates}
        currentUserId={viewer.id}
      />
    </>
  );
}
