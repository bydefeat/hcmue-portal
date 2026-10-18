import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { requirePermission } from "@/modules/access/access.query";
import { AuditLogTable } from "@/modules/audit/components/audit-log-table";
import { getAuditLog } from "@/modules/audit/audit.query";

export const metadata: Metadata = { title: "Nhật ký thao tác" };

export default async function Page() {
  await requirePermission("audit.view");
  const entries = await getAuditLog();
  return (
    <>
      <PageHeader
        title="Nhật ký thao tác"
        description="Mọi thao tác sửa dữ liệu, duyệt, công bố và đổi quyền đều được ghi lại kèm giá trị trước và sau. Nhật ký không sửa hay xóa được."
      />
      <AuditLogTable entries={entries} />
    </>
  );
}
