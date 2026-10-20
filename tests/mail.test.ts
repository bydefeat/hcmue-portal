import assert from "node:assert/strict";
import { after, describe, mock, test } from "node:test";
import { eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { newId } from "@/shared/libs/id.lib";
import type { MailMessage, MailResult } from "@/shared/libs/mail.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { MAIL_CONSTRAINT_MESSAGE } from "@/modules/mail/mail.constant";
import { deliverDueMail, enqueueMail, purgeSentMail } from "@/modules/mail/mail.lib";
import { afterFailedAttempt, MAIL_MAX_ATTEMPTS, uniqueRecipients } from "@/modules/mail/mail.rule";
import { mailOutbox } from "@/modules/mail/mail.schema";

// Mỗi test ghi thư có tiêu đề riêng và chỉ gửi đúng id của mình (deliverDueMail({ ids })): các file test chạy song song
// không gửi hộ thư của nhau. Dọn hết thư thử ở after() để không còn dòng mail_outbox nào.
const TAG = `[mail-test ${newId()}]`;
after(async () => {
  await db.delete(mailOutbox).where(eq(mailOutbox.subject, TAG));
  await db.$client.end();
});

const MINUTE = 60_000;

function message(recipients: string[], subject = TAG) {
  return { kind: "registration-reminder" as const, to: recipients, subject, text: "Nội dung thử" };
}

async function rowsOf(ids: string[]) {
  return db.select().from(mailOutbox).where(inArray(mailOutbox.id, ids)).orderBy(mailOutbox.recipient);
}

async function enqueueCommitted(recipients: string[]) {
  return db.transaction((tx) => enqueueMail(tx, [message(recipients)]));
}

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

const failing = async (): Promise<MailResult> => ({ ok: false, error: "HTTP 500 Resend tạm lỗi" });

describe("mail: lịch gửi lại", () => {
  test("lùi dần 1, 5, 30, 120, 480 phút, lần thứ 6 vẫn lỗi thì ngừng", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    const delays = [1, 2, 3, 4, 5].map((attempts) => {
      const next = afterFailedAttempt(attempts, now);
      assert.equal(next.status, "pending");
      return next.status === "pending" ? (next.nextAttemptAt.getTime() - now.getTime()) / MINUTE : 0;
    });
    assert.deepEqual(delays, [1, 5, 30, 120, 480]);
    assert.equal(MAIL_MAX_ATTEMPTS, 6);
    assert.deepEqual(afterFailedAttempt(6, now), { status: "failed" });
  });

  test("mỗi địa chỉ một thư, bỏ trống và trùng", () => {
    assert.deepEqual(uniqueRecipients([" a@hcmue.edu.vn", "a@hcmue.edu.vn", "", "b@hcmue.edu.vn "]), ["a@hcmue.edu.vn", "b@hcmue.edu.vn"]);
  });
});

describe("mail: hàng đợi trên DB", () => {
  test("xếp hàng trong transaction: rollback thì không còn thư; địa chỉ sai bị DB chặn", async () => {
    let ids: string[] = [];
    await inRollback(async (tx) => {
      ids = await enqueueMail(tx, [message(["sv1@student.hcmue.edu.vn", "sv2@student.hcmue.edu.vn", "sv1@student.hcmue.edu.vn"])]);
      const queued = await tx.select().from(mailOutbox).where(inArray(mailOutbox.id, ids));
      assert.equal(queued.length, 2);
      assert.ok(queued.every((row) => row.status === "pending" && row.attempts === 0 && row.sentAt === null));
    });
    assert.equal(ids.length, 2);
    assert.equal((await rowsOf(ids)).length, 0);

    const invalid = await db.transaction((tx) => enqueueMail(tx, [message(["khong-phai-email"])])).catch((error: unknown) => error);
    assert.equal(pgErrorMessage(invalid, MAIL_CONSTRAINT_MESSAGE), "Địa chỉ người nhận thư không hợp lệ.");
  });

  test("gửi thành công thì sent; chưa có khóa Resend thì thư in ra log", async () => {
    const recipients = ["gui1@student.hcmue.edu.vn", "gui2@student.hcmue.edu.vn"];
    const ids = await enqueueCommitted(recipients);
    const warn = mock.method(console, "warn", () => {});
    try {
      const outcome = await deliverDueMail({ ids });
      assert.deepEqual(outcome, { claimed: 2, sent: 2, retrying: 0, failed: 0 });
      const logged = warn.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes(TAG));
      assert.equal(logged.length, 2);
      for (const recipient of recipients) assert.ok(logged.some((line) => line.includes(recipient)));
    } finally {
      warn.mock.restore();
    }
    const rows = await rowsOf(ids);
    assert.ok(rows.every((row) => row.status === "sent" && row.sentAt && row.attempts === 1 && row.lastError === null));
    // Đã gửi thì lần chạy sau không gửi lại.
    assert.equal((await deliverDueMail({ ids, send: failing })).claimed, 0);
  });

  test("lỗi thì lùi lịch gửi lại, chưa tới giờ thì không gửi, quá 6 lần thì failed", async () => {
    const [id] = await enqueueCommitted(["loi@student.hcmue.edu.vn"]);
    let now = new Date();
    const first = await deliverDueMail({ ids: [id], now, send: failing });
    assert.deepEqual(first, { claimed: 1, sent: 0, retrying: 1, failed: 0 });
    let [row] = await rowsOf([id]);
    assert.equal(row.status, "pending");
    assert.equal(row.attempts, 1);
    assert.equal(row.lastError, "HTTP 500 Resend tạm lỗi");
    assert.equal(row.nextAttemptAt.getTime(), now.getTime() + MINUTE);
    assert.equal((await deliverDueMail({ ids: [id], now, send: failing })).claimed, 0, "chưa tới giờ gửi lại");

    for (const attempts of [2, 3, 4, 5, 6]) {
      now = new Date(row.nextAttemptAt.getTime() + 1000);
      await deliverDueMail({ ids: [id], now, send: failing });
      [row] = await rowsOf([id]);
      assert.equal(row.attempts, attempts);
    }
    assert.equal(row.status, "failed");
    assert.equal((await deliverDueMail({ ids: [id], now: new Date(now.getTime() + 24 * 60 * MINUTE), send: failing })).claimed, 0, "thư failed chờ quản trị gửi lại");
  });

  test("thư kẹt ở sending quá hạn giữ chỗ thì được lấy lại; kẹt ở lần thử cuối thì failed", async () => {
    const [stuck, last] = await enqueueCommitted(["ket1@student.hcmue.edu.vn", "ket2@student.hcmue.edu.vn"]);
    const past = new Date(Date.now() - MINUTE);
    await db.update(mailOutbox).set({ status: "sending", attempts: 1, nextAttemptAt: past }).where(eq(mailOutbox.id, stuck));
    await db.update(mailOutbox).set({ status: "sending", attempts: MAIL_MAX_ATTEMPTS, nextAttemptAt: past }).where(eq(mailOutbox.id, last));
    // Đang trong hạn giữ chỗ thì không ai lấy (lần gửi kia có thể chỉ đang chậm).
    const [fresh] = await enqueueCommitted(["dang-gui@student.hcmue.edu.vn"]);
    await db.update(mailOutbox).set({ status: "sending", attempts: 1, nextAttemptAt: new Date(Date.now() + 5 * MINUTE) }).where(eq(mailOutbox.id, fresh));

    const sent: string[] = [];
    const outcome = await deliverDueMail({ ids: [stuck, last, fresh], send: async (mail) => (sent.push(String(mail.to)), { ok: true, id: "re_test" }) });
    assert.equal(outcome.sent, 1);
    assert.deepEqual(sent, ["ket1@student.hcmue.edu.vn"]);
    const rows = await rowsOf([stuck, last, fresh]);
    const byRecipient = new Map(rows.map((row) => [row.recipient, row]));
    assert.equal(byRecipient.get("ket1@student.hcmue.edu.vn")?.status, "sent");
    assert.equal(byRecipient.get("ket1@student.hcmue.edu.vn")?.attempts, 2);
    assert.equal(byRecipient.get("ket1@student.hcmue.edu.vn")?.providerMessageId, "re_test");
    assert.equal(byRecipient.get("ket2@student.hcmue.edu.vn")?.status, "failed");
    assert.equal(byRecipient.get("dang-gui@student.hcmue.edu.vn")?.status, "sending");
  });

  test("hai lần gửi song song không gửi trùng thư nào", async () => {
    const recipients = Array.from({ length: 30 }, (_, index) => `song-song-${index}@student.hcmue.edu.vn`);
    const ids = await enqueueCommitted(recipients);
    const deliveries = new Map<string, number>();
    const slow = async (mail: MailMessage): Promise<MailResult> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      deliveries.set(String(mail.to), (deliveries.get(String(mail.to)) ?? 0) + 1);
      return { ok: true, id: null };
    };
    // Mỗi lần lấy tối đa 10 thư: ba lần chạy cùng lúc phải chia nhau ba phần rời nhau, không lần nào lấy lại thư lần kia đang giữ.
    const runs = await Promise.all([1, 2, 3].map(() => deliverDueMail({ ids, limit: 10, send: slow })));
    assert.deepEqual(
      runs.map((run) => run.sent),
      [10, 10, 10],
    );
    assert.equal(deliveries.size, recipients.length);
    assert.ok([...deliveries.values()].every((count) => count === 1), "mỗi thư gửi đúng một lần");
    assert.ok((await rowsOf(ids)).every((row) => row.status === "sent" && row.attempts === 1));
  });

  test("dọn thư đã gửi quá 30 ngày, giữ thư mới hơn và thư chưa gửi", async () => {
    await inRollback(async (tx) => {
      const now = new Date();
      const day = 24 * 60 * MINUTE;
      const [old, recent, pending] = await enqueueMail(tx, [message(["cu@student.hcmue.edu.vn", "moi@student.hcmue.edu.vn", "cho@student.hcmue.edu.vn"])]);
      await tx.update(mailOutbox).set({ status: "sent", sentAt: new Date(now.getTime() - 31 * day) }).where(eq(mailOutbox.id, old));
      await tx.update(mailOutbox).set({ status: "sent", sentAt: new Date(now.getTime() - 29 * day) }).where(eq(mailOutbox.id, recent));
      await tx.update(mailOutbox).set({ createdAt: new Date(now.getTime() - 60 * day) }).where(eq(mailOutbox.id, pending));
      assert.ok((await purgeSentMail(tx, now)) >= 1);
      const left = await tx.select({ id: mailOutbox.id }).from(mailOutbox).where(inArray(mailOutbox.id, [old, recent, pending]));
      assert.deepEqual(left.map((row) => row.id).toSorted(), [recent, pending].toSorted());
    });
  });
});
