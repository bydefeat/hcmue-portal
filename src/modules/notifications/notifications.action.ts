"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { NOTIFICATION_READ_SCHEMA, type NotificationReadInput } from "@/modules/notifications/notifications.rule";
import { notifications } from "@/modules/notifications/notifications.schema";

const PORTAL_PATHS = ["/application", "/lecturer", "/administrator"];

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
  for (const path of PORTAL_PATHS) revalidatePath(path, "layout");
  return actionOk(rows.map((row) => row.id));
}
