import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotifications } from "@/modules/notifications/notifications.query";

export const metadata: Metadata = { title: "Thông báo của tôi" };

export default async function Page() {
  const notifications = await getNotifications("administrator");
  return (
    <>
      <PageHeader title="Thông báo của tôi" description="Hạn chót, đơn từ chờ xử lý, bảng điểm cần duyệt và các thay đổi hệ thống liên quan đến bạn." />
      <NotificationList notifications={notifications} />
    </>
  );
}
