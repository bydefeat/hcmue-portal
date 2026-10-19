import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { RequestInbox } from "@/modules/requests/components/request-inbox";
import { REQUEST_STATUS } from "@/modules/requests/requests.constant";
import { getRequests } from "@/modules/requests/requests.query";
import type { RequestStatus, StepRole } from "@/modules/requests/requests.type";

export const metadata: Metadata = { title: "Đơn từ" };

function actorRolesOf(viewer: Viewer): StepRole[] {
  if (viewer.roleKey === "faculty-secretary") return ["faculty"];
  if (viewer.roleKey === "exam-office") return ["exam-office"];
  if (viewer.roleKey === "academic-officer") return ["academic-office"];
  return ["academic-office", "faculty", "exam-office"];
}

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const viewer = await requirePermission("requests.process");
  const [{ status }, all] = await Promise.all([searchParams, getRequests()]);
  const requests = all.filter((request) => inScope(viewer, request.faculty));
  const roles = actorRolesOf(viewer);
  const waiting = requests.filter((request) => request.currentStep && roles.includes(request.currentStep.role) && (request.status === "pending" || request.status === "in-review"));
  const overdue = waiting.filter((request) => request.isOverdue).length;
  const initialStatus = status && status in REQUEST_STATUS ? (status as RequestStatus) : undefined;

  return (
    <>
      <PageHeader
        title="Đơn từ"
        description={
          waiting.length > 0
            ? `${waiting.length} đơn đang chờ đơn vị của bạn xử lý${overdue > 0 ? `, ${overdue} đơn đã quá hạn` : ""}. Mỗi đơn đi qua các bước duyệt theo quy định, hạn xử lý tính theo ngày từ khi đến lượt.`
            : "Không còn đơn chờ đơn vị của bạn xử lý. Mỗi đơn đi qua các bước duyệt theo quy định."
        }
      />
      <RequestInbox requests={requests} mode="process" actorName={viewer.name} actorRoles={roles} initialStatus={initialStatus} />
    </>
  );
}
