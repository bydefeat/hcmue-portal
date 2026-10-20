import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { requirePermission } from "@/modules/access/access.query";
import { AuditLogTable } from "@/modules/audit/components/audit-log-table";
import { AUDIT_ACTION, AUDIT_ENTITY_LABEL } from "@/modules/audit/audit.constant";
import { getAuditLogPage } from "@/modules/audit/audit.query";
import type { AuditAction, AuditEntityType } from "@/modules/audit/audit.type";

export const metadata: Metadata = { title: "Nhật ký thao tác" };

type Search = { page?: string; q?: string; actor?: string; action?: string; entityType?: string; entityId?: string; from?: string; to?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("audit.view");
  const search = await searchParams;
  const filters = {
    q: search.q?.slice(0, 100),
    actor: search.actor?.slice(0, 100),
    action: search.action && search.action in AUDIT_ACTION ? (search.action as AuditAction) : undefined,
    entityType: search.entityType && search.entityType in AUDIT_ENTITY_LABEL ? (search.entityType as AuditEntityType) : undefined,
    entityId: search.entityId?.slice(0, 100),
    from: search.from,
    to: search.to,
  };
  const page = await getAuditLogPage({ ...filters, page: Number(search.page) || 1 });
  return (
    <>
      <PageHeader
        title="Nhật ký thao tác"
        description="Mọi thao tác sửa dữ liệu, duyệt, công bố và đổi quyền đều được ghi lại kèm giá trị trước và sau. Nhật ký không sửa hay xóa được, chỉ hết hạn lưu theo cấu hình."
      />
      <AuditLogTable key={JSON.stringify(search)} page={page} filters={filters} />
    </>
  );
}
