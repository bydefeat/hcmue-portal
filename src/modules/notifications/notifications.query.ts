import "server-only";
import { cache } from "react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { notifications } from "@/modules/notifications/notifications.schema";
import type { AppNotification, NotificationAudience } from "@/modules/notifications/notifications.type";

const LIMIT = 100;

// Thông báo của tài khoản đang đăng nhập ở một cổng; layout (chuông) và trang thông báo cùng gọi trong một request.
export const getNotifications = cache(async (audience: NotificationAudience): Promise<AppNotification[]> => {
  const { user } = await requireSession();
  const rows = await db
    .select({
      id: notifications.id,
      audience: notifications.audience,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, user.id), eq(notifications.audience, audience)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(LIMIT);
  return rows.map(({ createdAt, readAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), isRead: readAt !== null }));
});
