import "server-only";
import { cache } from "react";
import { db } from "@/shared/libs/db.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { notificationPage, unreadNotificationCount, type NotificationQuery } from "@/modules/notifications/notifications.lib";
import type { AppNotification, NotificationAudience, NotificationPage } from "@/modules/notifications/notifications.type";

export type { NotificationQuery };

// Thông báo của tài khoản đang đăng nhập ở một cổng, mới nhất trước, từng trang theo con trỏ (xem thêm).
export async function getNotificationPage(audience: NotificationAudience, query: NotificationQuery = {}): Promise<NotificationPage> {
  const { user } = await requireSession();
  return notificationPage(db, user.id, audience, query);
}

// Chuông thông báo của layout: vài dòng mới nhất; layout và trang cùng gọi trong một request.
export const getNotifications = cache(async (audience: NotificationAudience): Promise<AppNotification[]> => {
  return (await getNotificationPage(audience, { limit: 20 })).items;
});

// Số chưa đọc đếm bằng SQL trên toàn bộ thông báo của cổng, không chỉ trong trang đang tải.
export const getUnreadNotificationCount = cache(async (audience: NotificationAudience): Promise<number> => {
  const { user } = await requireSession();
  return unreadNotificationCount(db, user.id, audience);
});
