import type { Metadata } from "next";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const notifications = await getNotifications("student");
  return (
    <>
      <PageHeader title="Thông báo" description="Hạn chót, tiến độ đơn từ, điểm và lịch thi của bạn." />
      <NotificationList notifications={notifications} />
    </>
  );
}
