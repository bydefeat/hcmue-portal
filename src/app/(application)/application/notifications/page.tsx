import type { Metadata } from "next";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { getNotifications } from "@/modules/notifications/notifications.query";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const notifications = await getNotifications("student");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Hạn chót, tiến độ đơn từ, điểm và lịch thi của bạn.</p>
      <NotificationList notifications={notifications} />
    </div>
  );
}
