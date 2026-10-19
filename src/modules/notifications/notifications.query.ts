import { mockDelay } from "@/shared/libs/mock-request.lib";
import { NOTIFICATIONS } from "@/modules/notifications/notifications.mock";
import type { NotificationAudience } from "@/modules/notifications/notifications.type";

export async function getNotifications(audience: NotificationAudience) {
  await mockDelay();
  return NOTIFICATIONS.filter((notification) => notification.audience === audience).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
