import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { switchDemoViewer } from "@/modules/access/access.action";
import { AccessManager } from "@/modules/access/components/access-manager";
import { getRoleAssignments, getRoles, requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Phân quyền" };

export default async function Page() {
  const viewer = await requirePermission("access.manage");
  const [roles, assignments] = await Promise.all([getRoles(), getRoleAssignments()]);
  const faculties = [...new Set(MOCK_MAJORS.map((major) => major.faculty))];

  return (
    <>
      <PageHeader
        title="Phân quyền"
        description="Mỗi vai trò là một tập quyền. Vai trò theo khoa chỉ thấy dữ liệu của khoa được chỉ định. Dùng Xem thử để kiểm tra giao diện đúng như cán bộ đó thấy."
      />
      <AccessManager
        roles={roles}
        assignments={assignments}
        faculties={faculties}
        currentUserId={viewer.id}
        viewerName={viewer.name}
        switchAction={switchDemoViewer}
      />
    </>
  );
}
