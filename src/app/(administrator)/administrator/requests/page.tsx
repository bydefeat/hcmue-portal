import type { Metadata } from "next";
import { Alert } from "antd";
import { PageHeader } from "@/shared/components/ui/page-header";
import { can } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { RequestInbox } from "@/modules/requests/components/request-inbox";
import { officeStepRoles, REQUEST_STATUS } from "@/modules/requests/requests.constant";
import { getReassignCandidates, getRequests } from "@/modules/requests/requests.query";
import type { RequestStatus } from "@/modules/requests/requests.type";

export const metadata: Metadata = { title: "Đơn từ" };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; open?: string }> }) {
  const viewer = await requirePermission("requests.process");
  const supervise = can(viewer, "requests.supervise");
  const [{ status, open }, requests, candidates] = await Promise.all([searchParams, getRequests(), supervise ? getReassignCandidates() : Promise.resolve([])]);
  const waiting = requests.filter((request) => request.can.decide);
  const overdue = waiting.filter((request) => request.isOverdue).length;
  const initialStatus = status && status in REQUEST_STATUS ? (status as RequestStatus) : undefined;
  const noSteps = officeStepRoles(viewer.permissions).length === 0 && !supervise;

  return (
    <>
      <PageHeader
        title="Đơn từ"
        description={
          waiting.length > 0
            ? `${waiting.length} đơn đang chờ đơn vị của bạn xử lý${overdue > 0 ? `, ${overdue} đơn đã quá hạn` : ""}. Hạn xử lý tính theo ngày làm việc từ khi đến lượt.`
            : "Không còn đơn chờ đơn vị của bạn xử lý. Mỗi đơn đi qua các bước duyệt theo quy định, hạn tính theo ngày làm việc."
        }
      />
      {noSteps && (
        <Alert
          type="info"
          showIcon
          className="mb-3"
          title="Vai trò đang dùng chưa được giao bước xử lý đơn nào"
          description="Danh sách chỉ hiện đơn có bước thuộc quyền của vai trò (Xử lý bước của khoa, Phòng Đào tạo, Phòng Khảo thí). Nhờ quản trị hệ thống cấp quyền ở trang Phân quyền."
        />
      )}
      <RequestInbox requests={requests} mode="process" processAs="office" initialStatus={initialStatus} initialOpenId={open} reassignCandidates={candidates} />
    </>
  );
}
