import "server-only";
import { after } from "next/server";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { sendMail, type MailMessage, type MailResult } from "@/shared/libs/mail.lib";
import { mailOutbox } from "@/modules/mail/mail.schema";
import {
  afterFailedAttempt,
  clipMailError,
  MAIL_MAX_ATTEMPTS,
  MAIL_SENDING_LEASE_MINUTES,
  MAIL_SENT_RETENTION_DAYS,
  uniqueRecipients,
} from "@/modules/mail/mail.rule";
import type { MailKind } from "@/modules/mail/mail.type";

type Executor = Transaction | typeof db;

export type OutboxMessage = Omit<MailMessage, "to"> & {
  kind: MailKind;
  to: string | string[];
};

type DeliverOptions = {
  limit?: number;
  ids?: string[];
  now?: Date;
  send?: (message: MailMessage) => Promise<MailResult>;
};

const INSERT_BATCH = 1000;
const SEND_CONCURRENCY = 10;
const DEFAULT_LIMIT = 50;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export async function enqueueMail(tx: Executor, messages: OutboxMessage[]) {
  const rows = messages.flatMap(({ to, kind, subject, text, html }) =>
    uniqueRecipients([to].flat()).map((recipient) => ({ kind, recipient, subject, text, html: html ?? null })),
  );
  const ids: string[] = [];
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    const inserted = await tx.insert(mailOutbox).values(rows.slice(start, start + INSERT_BATCH)).returning({ id: mailOutbox.id });
    ids.push(...inserted.map((row) => row.id));
  }
  return ids;
}

async function failAbandonedMail(now: Date, ids: string[] | undefined) {
  await db
    .update(mailOutbox)
    .set({ status: "failed", lastError: "Tiến trình gửi bị ngắt giữa chừng ở lần thử cuối" })
    .where(
      and(
        eq(mailOutbox.status, "sending"),
        lte(mailOutbox.nextAttemptAt, now),
        gte(mailOutbox.attempts, MAIL_MAX_ATTEMPTS),
        ids ? inArray(mailOutbox.id, ids) : undefined,
      ),
    );
}

export async function deliverDueMail(options: DeliverOptions = {}) {
  const { limit = DEFAULT_LIMIT, ids, now = new Date(), send = sendMail } = options;
  const outcome = { claimed: 0, sent: 0, retrying: 0, failed: 0 };
  if (ids && ids.length === 0) return outcome;
  await failAbandonedMail(now, ids);
  const due = db
    .select({ id: mailOutbox.id })
    .from(mailOutbox)
    .where(
      and(
        inArray(mailOutbox.status, ["pending", "sending"]),
        lte(mailOutbox.nextAttemptAt, now),
        lt(mailOutbox.attempts, MAIL_MAX_ATTEMPTS),
        ids ? inArray(mailOutbox.id, ids) : undefined,
      ),
    )
    .orderBy(asc(mailOutbox.nextAttemptAt))
    .limit(limit)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(mailOutbox)
    .set({ status: "sending", attempts: sql`${mailOutbox.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + MAIL_SENDING_LEASE_MINUTES * MINUTE) })
    .where(inArray(mailOutbox.id, due))
    .returning({ id: mailOutbox.id, recipient: mailOutbox.recipient, subject: mailOutbox.subject, text: mailOutbox.text, html: mailOutbox.html, attempts: mailOutbox.attempts });
  outcome.claimed = claimed.length;

  for (let start = 0; start < claimed.length; start += SEND_CONCURRENCY) {
    await Promise.all(
      claimed.slice(start, start + SEND_CONCURRENCY).map(async (mail) => {
        const result = await send({ to: mail.recipient, subject: mail.subject, text: mail.text, html: mail.html ?? undefined }).catch(
          (error: unknown): MailResult => ({ ok: false, error: error instanceof Error ? error.message : "Không gửi được thư" }),
        );
        const mine = and(eq(mailOutbox.id, mail.id), eq(mailOutbox.status, "sending"));
        if (result.ok) {
          await db.update(mailOutbox).set({ status: "sent", sentAt: new Date(), providerMessageId: result.id, lastError: null }).where(mine);
          outcome.sent += 1;
          return;
        }
        const next = afterFailedAttempt(mail.attempts, now);
        await db
          .update(mailOutbox)
          .set(next.status === "failed" ? { status: "failed", lastError: clipMailError(result.error) } : { status: "pending", nextAttemptAt: next.nextAttemptAt, lastError: clipMailError(result.error) })
          .where(mine);
        if (next.status === "failed") outcome.failed += 1;
        else outcome.retrying += 1;
      }),
    );
  }
  return outcome;
}

async function deliverAllDue(options: Omit<DeliverOptions, "limit"> & { maxBatches: number }) {
  const total = { sent: 0, retrying: 0, failed: 0 };
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    const outcome = await deliverDueMail({ ...options, limit: DEFAULT_LIMIT });
    total.sent += outcome.sent;
    total.retrying += outcome.retrying;
    total.failed += outcome.failed;
    if (outcome.claimed < DEFAULT_LIMIT) break;
  }
  return total;
}

export async function deliverQueuedMail(ids: string[]) {
  if (ids.length === 0) return { sent: 0, retrying: 0, failed: 0 };
  return deliverAllDue({ ids, maxBatches: Math.ceil(ids.length / DEFAULT_LIMIT) + 1 });
}

export function deliverMailSoon(ids: string[]) {
  if (ids.length === 0) return;
  after(() => deliverQueuedMail(ids).catch((error: unknown) => console.error("[mail] Không gửi được thư vừa xếp hàng:", error)));
}

export async function purgeSentMail(executor: Executor = db, now = new Date()) {
  const removed = await executor
    .delete(mailOutbox)
    .where(and(eq(mailOutbox.status, "sent"), lt(mailOutbox.sentAt, new Date(now.getTime() - MAIL_SENT_RETENTION_DAYS * DAY))))
    .returning({ id: mailOutbox.id });
  return removed.length;
}

export async function runMailOutboxJob() {
  const delivered = await deliverAllDue({ maxBatches: 20 });
  return { ...delivered, purged: await purgeSentMail() };
}
