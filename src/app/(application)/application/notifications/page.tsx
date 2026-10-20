import type { Metadata } from "next";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotificationPage, getUnreadNotificationCount } from "@/modules/notifications/notifications.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const [page, unread] = await Promise.all([getNotificationPage("student"), getUnreadNotificationCount("student")]);
  return (
    <>
      <PageHeader title="Thông báo" description="Hạn chót, tiến độ đơn từ, điểm và lịch thi của bạn." />
      <NotificationList audience="student" initialPage={page} unreadCount={unread} />
    </>
  );
}
