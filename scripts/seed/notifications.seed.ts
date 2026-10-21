import type { Transaction } from "@/shared/libs/db.lib";
import { NOTIFICATIONS } from "@/modules/notifications/notifications.mock";
import { notifications } from "@/modules/notifications/notifications.schema";
import type { NotificationAudience } from "@/modules/notifications/notifications.type";
import type { SeedContext } from "./context";

export async function seedNotifications(tx: Transaction, context: SeedContext) {
  const recipientOf: Record<NotificationAudience, string> = {
    student: context.studentUserId,
    lecturer: context.lecturerUserId,
    administrator: context.adminUserId,
  };
  await tx.insert(notifications).values(
    NOTIFICATIONS.map(({ isRead, createdAt, ...notification }) => ({
      ...notification,
      recipientUserId: recipientOf[notification.audience],
      createdAt: new Date(createdAt),
      readAt: isRead ? new Date(new Date(createdAt).getTime() + 60 * 60 * 1000) : null,
    })),
  );
  return { notifications: NOTIFICATIONS.length };
}
