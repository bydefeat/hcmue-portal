import type { Metadata } from "next";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotificationPage, getUnreadNotificationCount } from "@/modules/notifications/notifications.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const [page, unread] = await Promise.all([getNotificationPage("lecturer"), getUnreadNotificationCount("lecturer")]);
  return (
    <>
      <PageHeader title="Thông báo" description="Hạn nhập điểm, đơn từ cần xử lý, lịch coi thi và việc cố vấn học tập." />
      <NotificationList audience="lecturer" initialPage={page} unreadCount={unread} />
    </>
  );
}
