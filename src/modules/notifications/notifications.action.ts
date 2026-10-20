"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/shared/libs/db.lib";
import { actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { getNotificationPage } from "@/modules/notifications/notifications.query";
import {
  NOTIFICATION_AUDIENCE_SCHEMA,
  NOTIFICATION_DELETE_SCHEMA,
  NOTIFICATION_PAGE_SCHEMA,
  NOTIFICATION_READ_SCHEMA,
  type NotificationDeleteInput,
  type NotificationPageInput,
  type NotificationReadInput,
} from "@/modules/notifications/notifications.rule";
import { notifications } from "@/modules/notifications/notifications.schema";
import type { NotificationAudience, NotificationPage } from "@/modules/notifications/notifications.type";

const PORTAL_PATHS = ["/application", "/lecturer", "/administrator"];

function revalidatePortals() {
  for (const path of PORTAL_PATHS) revalidatePath(path, "layout");
}

// Đánh dấu đã đọc: chỉ thông báo của chính tài khoản đang đăng nhập, id của người khác bị bỏ qua.
// Trả về id đã đọc (gồm cả những thông báo đã đọc từ trước) để giao diện khớp với DB.
export async function markNotificationsRead(input: NotificationReadInput): Promise<ActionResult<string[]>> {
  const { user } = await requireSession();
  const parsed = parseInput(NOTIFICATION_READ_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const owned = and(eq(notifications.recipientUserId, user.id), inArray(notifications.id, parsed.data.ids));
  let rows: { id: string }[];
  try {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(owned, isNull(notifications.readAt)));
    rows = await db.select({ id: notifications.id }).from(notifications).where(owned);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePortals();
  return actionOk(rows.map((row) => row.id));
}

// Đọc hết mọi thông báo chưa đọc của một cổng (kể cả dòng chưa tải lên trang).
export async function markAllNotificationsRead(audience: NotificationAudience): Promise<ActionResult<number>> {
  const { user } = await requireSession();
  const parsed = parseInput(z.object({ audience: NOTIFICATION_AUDIENCE_SCHEMA }), { audience });
  if (!parsed.ok) return parsed;
  let marked: number;
  try {
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientUserId, user.id), eq(notifications.audience, parsed.data.audience), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    marked = rows.length;
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePortals();
  return actionOk(marked);
}

// Xóa thông báo khỏi danh sách của chính mình (không ảnh hưởng người nhận khác).
export async function deleteNotifications(input: NotificationDeleteInput): Promise<ActionResult<string[]>> {
  const { user } = await requireSession();
  const parsed = parseInput(NOTIFICATION_DELETE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let removed: string[];
  try {
    const rows = await db
      .delete(notifications)
      .where(and(eq(notifications.recipientUserId, user.id), inArray(notifications.id, parsed.data.ids)))
      .returning({ id: notifications.id });
    removed = rows.map((row) => row.id);
  } catch (error) {
    return actionFailure(error);
  }
  revalidatePortals();
  return actionOk(removed);
}

// Trang thông báo: tải trang kế tiếp (xem thêm) hoặc lọc theo loại, chưa đọc.
export async function loadNotifications(input: NotificationPageInput): Promise<ActionResult<NotificationPage>> {
  await requireSession();
  const parsed = parseInput(NOTIFICATION_PAGE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { audience, ...query } = parsed.data;
  try {
    return actionOk(await getNotificationPage(audience, query));
  } catch (error) {
    return actionFailure(error);
  }
}
