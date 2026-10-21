import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, isNotNull, isNull, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import {
  notificationPage,
  notifyLecturers,
  notifyStudents,
  notifyUsers,
  purgeOldNotifications,
  unreadNotificationCount,
  type NotificationMessage,
} from "@/modules/notifications/notifications.lib";
import { NOTIFICATION_PAGE_SCHEMA, NOTIFICATION_READ_SCHEMA, notificationPurgeCutoffs } from "@/modules/notifications/notifications.rule";
import { notifications } from "@/modules/notifications/notifications.schema";
import { lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const MESSAGE: NotificationMessage = { kind: "system", title: "Thông báo kiểm thử", body: "Kiểm thử ghi thông báo", href: "/application/notifications" };

async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

const rowsOf = (tx: Transaction, userId: string) =>
  tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.title, MESSAGE.title)));

const ID = "0192f3a4-0000-7000-8000-000000000001";

describe("notifications: kiểm dữ liệu đánh dấu đã đọc", () => {
  test("bỏ id trùng", () => {
    const parsed = parseInput(NOTIFICATION_READ_SCHEMA, { ids: [ID, ID] });
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.ids, [ID]);
  });

  test("id không phải uuid hoặc danh sách rỗng bị chặn", () => {
    const invalid = parseInput(NOTIFICATION_READ_SCHEMA, { ids: ["nt-a01"] });
    assert.ok(!invalid.ok && invalid.fieldErrors?.["ids.0"]);
    const empty = parseInput(NOTIFICATION_READ_SCHEMA, { ids: [] });
    assert.ok(!empty.ok && empty.fieldErrors?.ids);
  });
});

describe("notifications: ghi thông báo trong transaction của thao tác", () => {
  test("sinh viên có tài khoản nhận đúng một thông báo ở cổng sinh viên; rollback thì không còn", async () => {
    const [student] = await db.select({ id: students.id, userId: students.userId }).from(students).where(isNotNull(students.userId)).limit(1);
    assert.ok(student?.userId, "seed cần ít nhất một sinh viên có tài khoản");
    const userId = student.userId;
    await inRollback(async (tx) => {
      const notified = await notifyStudents(tx, [student.id, student.id], MESSAGE);
      assert.deepEqual(notified, [student.id]);
      const rows = await rowsOf(tx, userId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].audience, "student");
      assert.equal(rows[0].kind, "system");
      assert.equal(rows[0].href, MESSAGE.href);
      assert.equal(rows[0].readAt, null);
    });
    const left = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.recipientUserId, userId), eq(notifications.title, MESSAGE.title)));
    assert.equal(left.length, 0);
  });

  test("sinh viên chưa có tài khoản bị bỏ qua, không lỗi", async () => {
    const [withAccount] = await db.select({ id: students.id, userId: students.userId }).from(students).where(isNotNull(students.userId)).limit(1);
    const [withoutAccount] = await db.select({ id: students.id }).from(students).where(isNull(students.userId)).limit(1);
    assert.ok(withoutAccount, "seed cần ít nhất một sinh viên chưa có tài khoản");
    await inRollback(async (tx) => {
      assert.deepEqual(await notifyStudents(tx, [withoutAccount.id], MESSAGE), []);
      assert.equal(await tx.$count(notifications, eq(notifications.title, MESSAGE.title)), 0);
      assert.deepEqual(await notifyStudents(tx, [withoutAccount.id, withAccount.id], MESSAGE), [withAccount.id]);
      assert.equal(await tx.$count(notifications, eq(notifications.title, MESSAGE.title)), 1);
    });
  });

  test("giảng viên nhận ở cổng giảng viên; danh sách rỗng không ghi gì", async () => {
    const [lecturer] = await db.select({ id: lecturers.id, userId: lecturers.userId }).from(lecturers).where(isNotNull(lecturers.userId)).limit(1);
    assert.ok(lecturer?.userId, "seed cần ít nhất một giảng viên có tài khoản");
    const userId = lecturer.userId;
    await inRollback(async (tx) => {
      assert.deepEqual(await notifyStudents(tx, [], MESSAGE), []);
      await notifyUsers(tx, [], "administrator", MESSAGE);
      assert.equal(await tx.$count(notifications, eq(notifications.title, MESSAGE.title)), 0);
      assert.deepEqual(await notifyLecturers(tx, [lecturer.id], { ...MESSAGE, href: "/lecturer/notifications" }), [lecturer.id]);
      const rows = await rowsOf(tx, userId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].audience, "lecturer");
    });
  });
});

describe("notifications: phân trang, đếm chưa đọc, lọc, dọn cũ", () => {
  test("xem thêm theo con trỏ không trùng không sót; số chưa đọc đếm trên toàn bộ, không chỉ trang đầu", async () => {
    const [lecturer] = await db.select({ userId: lecturers.userId }).from(lecturers).where(isNotNull(lecturers.userId)).limit(1);
    const userId = lecturer.userId!;
    await inRollback(async (tx) => {
      const before = await unreadNotificationCount(tx, userId, "lecturer");
      const base = Date.parse("2001-01-01T00:00:00Z");
      await tx.insert(notifications).values(
        Array.from({ length: 130 }, (_, index) => ({
          recipientUserId: userId,
          audience: "lecturer" as const,
          kind: index % 10 === 0 ? ("grade" as const) : ("system" as const),
          title: `${MESSAGE.title} ${index}`,
          body: MESSAGE.body,
          href: "/lecturer/notifications",
          createdAt: new Date(base + Math.floor(index / 2) * 1000),
          readAt: index < 2 ? new Date(base) : null,
        })),
      );
      assert.equal(await unreadNotificationCount(tx, userId, "lecturer"), before + 128);
      const seen = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        const page = await notificationPage(tx, userId, "lecturer", { cursor, limit: 40 });
        for (const item of page.items) {
          assert.ok(!seen.has(item.id), "không trùng giữa các trang");
          seen.add(item.id);
        }
        cursor = page.nextCursor ?? undefined;
        pages += 1;
      } while (cursor && pages < 20);
      const total = await tx.$count(notifications, and(eq(notifications.recipientUserId, userId), eq(notifications.audience, "lecturer")));
      assert.equal(seen.size, total);
      const grades = await notificationPage(tx, userId, "lecturer", { kind: "grade", limit: 100 });
      assert.ok(grades.items.length >= 13 && grades.items.every((item) => item.kind === "grade"));
      const unreadOnly = await notificationPage(tx, userId, "lecturer", { unreadOnly: true, limit: 100 });
      assert.ok(unreadOnly.items.every((item) => !item.isRead));
      tx.rollback();
    });
  });

  test("dọn thông báo: đã đọc quá 180 ngày, chưa đọc quá 365 ngày; thông báo mới giữ nguyên", async () => {
    const [lecturer] = await db.select({ userId: lecturers.userId }).from(lecturers).where(isNotNull(lecturers.userId)).limit(1);
    const userId = lecturer.userId!;
    const now = new Date("2026-10-20T00:00:00Z");
    const day = 24 * 3_600_000;
    await inRollback(async (tx) => {
      const values = [
        { title: "cu-da-doc", createdAt: new Date(now.getTime() - 200 * day), readAt: new Date(now.getTime() - 199 * day) },
        { title: "cu-chua-doc", createdAt: new Date(now.getTime() - 200 * day), readAt: null },
        { title: "rat-cu-chua-doc", createdAt: new Date(now.getTime() - 400 * day), readAt: null },
        { title: "moi-da-doc", createdAt: new Date(now.getTime() - 10 * day), readAt: new Date(now.getTime() - 9 * day) },
      ];
      await tx.insert(notifications).values(values.map((value) => ({ ...value, recipientUserId: userId, audience: "lecturer" as const, kind: "system" as const, body: "x", href: "/lecturer/notifications" })));
      const before = await tx.$count(notifications);
      const { notificationsRemoved } = await purgeOldNotifications(tx, now);
      const left = await tx.select({ title: notifications.title }).from(notifications).where(eq(notifications.recipientUserId, userId));
      const titles = new Set(left.map((row) => row.title));
      assert.ok(!titles.has("cu-da-doc") && !titles.has("rat-cu-chua-doc"));
      assert.ok(titles.has("cu-chua-doc") && titles.has("moi-da-doc"));
      assert.equal(await tx.$count(notifications), before - notificationsRemoved);
    });
    assert.deepEqual(notificationPurgeCutoffs(now, 180, 365), { read: new Date(now.getTime() - 180 * day), unread: new Date(now.getTime() - 365 * day) });
  });

  test("kiểm tham số tải trang", () => {
    assert.ok(parseInput(NOTIFICATION_PAGE_SCHEMA, { audience: "student", kind: "grade", unreadOnly: true }).ok);
    assert.ok(!parseInput(NOTIFICATION_PAGE_SCHEMA, { audience: "khach" }).ok);
  });
});
