import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, isNotNull, isNull, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { notifyLecturers, notifyStudents, notifyUsers, type NotificationMessage } from "@/modules/notifications/notifications.lib";
import { NOTIFICATION_READ_SCHEMA } from "@/modules/notifications/notifications.rule";
import { notifications } from "@/modules/notifications/notifications.schema";
import { lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const MESSAGE: NotificationMessage = { kind: "system", title: "Thông báo kiểm thử", body: "Kiểm thử ghi thông báo", href: "/application/notifications" };

// Chạy trong transaction rồi rollback: không để lại thông báo thử trong DB.
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
      // Truyền trùng id cũng chỉ ghi một dòng.
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
      // Lẫn sinh viên có và chưa có tài khoản: chỉ người có tài khoản nhận.
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
