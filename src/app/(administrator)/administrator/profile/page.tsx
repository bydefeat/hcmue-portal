import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PERMISSION_GROUPS } from "@/modules/access/access.constant";
import { getViewer, getViewerAssignments } from "@/modules/access/access.query";
import { AuditTimeline } from "@/modules/audit/components/audit-timeline";
import { getAuditLog } from "@/modules/audit/audit.query";
import { formatDate } from "@/shared/libs/date.lib";
import { CircleCheck, CircleMinus } from "defeat-icons-react";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Hồ sơ cá nhân" };

export default async function Page() {
  const viewer = await getViewer();
  const [assignments, log] = await Promise.all([getViewerAssignments(viewer.id), getAuditLog({ actorUserId: viewer.id })]);
  const assignment = assignments.find((entry) => entry.id === viewer.assignmentId);
  const own = log.slice(0, 10);

  return (
    <>
      <PageHeader title="Hồ sơ cá nhân" description="Thông tin tài khoản, vai trò đang được cấp và các thao tác gần đây của bạn." />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start sm:gap-6">
        <div className="flex flex-col gap-4">
          <SectionCard>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold">{viewer.name}</p>
                <p className="text-sm text-muted">{viewer.code}</p>
              </div>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Đơn vị</dt>
                <dd>{viewer.unit ?? "Chưa rõ"}</dd>
                <dt className="text-muted">Vai trò</dt>
                <dd className="text-pretty">{viewer.roleName}</dd>
                <dt className="text-muted">Phạm vi dữ liệu</dt>
                <dd>{viewer.faculty ?? "Toàn trường"}</dd>
                <dt className="text-muted">Cấp quyền</dt>
                <dd className="tabular-nums">{assignment ? `${formatDate(assignment.grantedAt)}${assignment.grantedBy ? `, bởi ${assignment.grantedBy}` : ""}` : "Chưa rõ"}</dd>
              </dl>
            </div>
          </SectionCard>
          <SectionCard title="Quyền của vai trò">
            <div className="flex flex-col gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">{group.label}</span>
                  <ul className="flex flex-col gap-1">
                    {group.permissions.map((permission) => {
                      const has = viewer.permissions.includes(permission.key);
                      return (
                        <li key={permission.key} className={`flex items-center gap-2 text-sm ${has ? "" : "text-muted"}`}>
                          {has ? <CircleCheck size={16} aria-label="Có quyền" className="shrink-0 text-green-700" /> : <CircleMinus size={16} aria-label="Không có quyền" className="shrink-0" />}
                          {permission.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Thao tác gần đây" className="min-w-0">
          <div className="flex flex-col gap-3">
            <AuditTimeline entries={own} emptyText="Bạn chưa thực hiện thao tác nào được ghi nhật ký." />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
