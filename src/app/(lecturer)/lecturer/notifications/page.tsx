import type { Metadata } from "next";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const notifications = await getNotifications("lecturer");
  return (
    <>
      <PageHeader title="Thông báo" description="Hạn nhập điểm, đơn từ cần xử lý, lịch coi thi và việc cố vấn học tập." />
      <NotificationList notifications={notifications} />
    </>
  );
}
