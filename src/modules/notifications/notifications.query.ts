import "server-only";
import { cache } from "react";
import { db } from "@/shared/libs/db.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { notificationPage, unreadNotificationCount, type NotificationQuery } from "@/modules/notifications/notifications.lib";
import type { AppNotification, NotificationAudience, NotificationPage } from "@/modules/notifications/notifications.type";

export type { NotificationQuery };

export async function getNotificationPage(audience: NotificationAudience, query: NotificationQuery = {}): Promise<NotificationPage> {
  const { user } = await requireSession();
  return notificationPage(db, user.id, audience, query);
}

export const getNotifications = cache(async (audience: NotificationAudience): Promise<AppNotification[]> => {
  return (await getNotificationPage(audience, { limit: 20 })).items;
});

export const getUnreadNotificationCount = cache(async (audience: NotificationAudience): Promise<number> => {
  const { user } = await requireSession();
  return unreadNotificationCount(db, user.id, audience);
});
