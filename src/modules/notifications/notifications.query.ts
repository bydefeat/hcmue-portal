import { mockDelay } from "@/shared/libs/mock-request.lib";
import { NOTIFICATIONS } from "./notifications.mock";
import type { NotificationAudience } from "./notifications.type";

export async function getNotifications(audience: NotificationAudience) {
  await mockDelay();
  return NOTIFICATIONS.filter((notification) => notification.audience === audience).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
