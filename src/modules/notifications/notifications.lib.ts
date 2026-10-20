import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_READ_RETENTION_DAYS, NOTIFICATION_UNREAD_RETENTION_DAYS } from "@/modules/notifications/notifications.constant";
import { notificationPurgeCutoffs } from "@/modules/notifications/notifications.rule";
import { notifications } from "@/modules/notifications/notifications.schema";
import type { AppNotification, NotificationAudience, NotificationKind, NotificationPage } from "@/modules/notifications/notifications.type";
import { lecturers, students } from "@/modules/users/users.schema";

export type NotificationMessage = {
  kind: NotificationKind;
  title: string;
  body: string;
  // Đường dẫn trong cổng của người nhận (/application/... cho sinh viên, /lecturer/... cho giảng viên).
  href: string;
  // Bỏ trống thì lấy giờ DB lúc ghi.
  createdAt?: Date;
};

type Executor = Transaction | typeof db;

const COLUMNS = {
  id: notifications.id,
  audience: notifications.audience,
  kind: notifications.kind,
  title: notifications.title,
  body: notifications.body,
  href: notifications.href,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
};

// Con trỏ trang: thời điểm tạo và id của dòng cuối trang trước ("2026-10-19T08:00:00.000Z|<uuid>").
function afterCursor(cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [at, id] = cursor.split("|");
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || !isUuid(id ?? "")) return undefined;
  return or(lt(notifications.createdAt, date), and(eq(notifications.createdAt, date), lt(notifications.id, id)));
}

export type NotificationQuery = { cursor?: string; kind?: NotificationKind; unreadOnly?: boolean; limit?: number };

// Một trang thông báo của một tài khoản ở một cổng (query kiểm phiên rồi gọi hàm này với tài khoản đang đăng nhập).
export async function notificationPage(executor: Executor, userId: string, audience: NotificationAudience, query: NotificationQuery = {}): Promise<NotificationPage> {
  const limit = Math.min(Math.max(query.limit ?? NOTIFICATION_PAGE_SIZE, 1), 100);
  const rows = await executor
    .select(COLUMNS)
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.audience, audience),
        query.kind ? eq(notifications.kind, query.kind) : undefined,
        query.unreadOnly ? isNull(notifications.readAt) : undefined,
        afterCursor(query.cursor),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  const items: AppNotification[] = rows.slice(0, limit).map(({ createdAt, readAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString(), isRead: readAt !== null }));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? `${last.createdAt}|${last.id}` : null };
}

export async function unreadNotificationCount(executor: Executor, userId: string, audience: NotificationAudience) {
  const [row] = await executor
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.audience, audience), isNull(notifications.readAt)));
  return row?.total ?? 0;
}

// Tiêu đề và nội dung cắt bớt cho vừa chuông thông báo; nội dung do người dùng nhập (lý do, nhận xét) có thể dài.
const TITLE_MAX = 200;
const BODY_MAX = 1000;

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Ghi thông báo trong cùng transaction với thao tác: thao tác rollback thì thông báo cũng mất, không báo việc chưa xảy ra.
// Người nhận thấy ở chuông và trang Thông báo của cổng tương ứng; cần email thì nơi gọi xếp thư riêng bằng enqueueMail.
export async function notifyUsers(tx: Executor, userIds: string[], audience: NotificationAudience, message: NotificationMessage) {
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return;
  await tx.insert(notifications).values(
    recipients.map((recipientUserId) => ({
      recipientUserId,
      audience,
      kind: message.kind,
      title: clip(message.title, TITLE_MAX),
      body: clip(message.body, BODY_MAX),
      href: message.href,
      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    })),
  );
}

// Báo cho sinh viên trên cổng sinh viên. Sinh viên chưa kích hoạt tài khoản cổng (students.userId trống) thì bỏ qua;
// trả về id sinh viên đã nhận để nơi gọi biết bao nhiêu người chưa nhận được.
export async function notifyStudents(tx: Executor, studentIds: string[], message: NotificationMessage): Promise<string[]> {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return [];
  const rows = await tx.select({ id: students.id, userId: students.userId }).from(students).where(inArray(students.id, ids));
  const recipients = rows.flatMap((row) => (row.userId ? [{ id: row.id, userId: row.userId }] : []));
  await notifyUsers(
    tx,
    recipients.map((recipient) => recipient.userId),
    "student",
    message,
  );
  return recipients.map((recipient) => recipient.id);
}

// Tác vụ notifications-cleanup: xóa thông báo đã đọc quá lâu và thông báo chưa đọc quá rất lâu, để bảng không phình mãi.
export async function purgeOldNotifications(executor: Executor = db, now = new Date()) {
  const cutoff = notificationPurgeCutoffs(now, NOTIFICATION_READ_RETENTION_DAYS, NOTIFICATION_UNREAD_RETENTION_DAYS);
  const removed = await executor
    .delete(notifications)
    .where(
      or(
        and(isNotNull(notifications.readAt), lt(notifications.createdAt, cutoff.read)),
        and(isNull(notifications.readAt), lt(notifications.createdAt, cutoff.unread)),
      ),
    )
    .returning({ id: notifications.id });
  return { notificationsRemoved: removed.length };
}

// Báo cho giảng viên trên cổng giảng viên; giảng viên chưa có tài khoản cổng thì bỏ qua. Trả về id giảng viên đã nhận.
export async function notifyLecturers(tx: Executor, lecturerIds: string[], message: NotificationMessage): Promise<string[]> {
  const ids = [...new Set(lecturerIds)];
  if (ids.length === 0) return [];
  const rows = await tx.select({ id: lecturers.id, userId: lecturers.userId }).from(lecturers).where(inArray(lecturers.id, ids));
  const recipients = rows.flatMap((row) => (row.userId ? [{ id: row.id, userId: row.userId }] : []));
  await notifyUsers(
    tx,
    recipients.map((recipient) => recipient.userId),
    "lecturer",
    message,
  );
  return recipients.map((recipient) => recipient.id);
}
