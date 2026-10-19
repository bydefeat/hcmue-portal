import "server-only";
import { inArray } from "drizzle-orm";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { notifications } from "@/modules/notifications/notifications.schema";
import type { NotificationAudience, NotificationKind } from "@/modules/notifications/notifications.type";
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

// Tiêu đề và nội dung cắt bớt cho vừa chuông thông báo; nội dung do người dùng nhập (lý do, nhận xét) có thể dài.
const TITLE_MAX = 200;
const BODY_MAX = 1000;

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Ghi thông báo trong cùng transaction với thao tác: thao tác rollback thì thông báo cũng mất, không báo việc chưa xảy ra.
// Chưa có dịch vụ email nên đây là kênh duy nhất: người nhận thấy ở chuông và trang Thông báo của cổng tương ứng.
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
