import "server-only";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { requireSchoolWidePermission } from "@/modules/access/access.query";
import { MAIL_SENT_RETENTION_DAYS } from "@/modules/mail/mail.rule";
import { mailOutbox } from "@/modules/mail/mail.schema";
import type { MailOutboxOverview } from "@/modules/mail/mail.type";

const PROBLEM_LIMIT = 100;

// Thư lỗi: đã ngừng thử, hoặc đang chờ gửi lại sau một lần lỗi. Không trả nội dung thư.
const PROBLEM_COLUMNS = {
  id: mailOutbox.id,
  kind: mailOutbox.kind,
  recipient: mailOutbox.recipient,
  subject: mailOutbox.subject,
  status: mailOutbox.status,
  attempts: mailOutbox.attempts,
  lastError: mailOutbox.lastError,
  nextAttemptAt: mailOutbox.nextAttemptAt,
  createdAt: mailOutbox.createdAt,
};

export async function getMailOutboxOverview(): Promise<MailOutboxOverview> {
  await requireSchoolWidePermission("settings.manage");
  const [[stats], problems] = await Promise.all([
    db
      .select({
        pending: sql<number>`count(*) FILTER (WHERE ${mailOutbox.status} IN ('pending', 'sending'))`.mapWith(Number),
        retrying: sql<number>`count(*) FILTER (WHERE ${mailOutbox.status} IN ('pending', 'sending') AND ${mailOutbox.lastError} IS NOT NULL)`.mapWith(Number),
        sentLast30Days: sql<number>`count(*) FILTER (WHERE ${mailOutbox.status} = 'sent' AND ${mailOutbox.sentAt} >= now() - make_interval(days => ${MAIL_SENT_RETENTION_DAYS}))`.mapWith(Number),
        failed: sql<number>`count(*) FILTER (WHERE ${mailOutbox.status} = 'failed')`.mapWith(Number),
      })
      .from(mailOutbox),
    db
      .select(PROBLEM_COLUMNS)
      .from(mailOutbox)
      .where(or(eq(mailOutbox.status, "failed"), and(inArray(mailOutbox.status, ["pending", "sending"]), isNotNull(mailOutbox.lastError))))
      .orderBy(desc(mailOutbox.createdAt))
      .limit(PROBLEM_LIMIT),
  ]);
  return {
    stats,
    problems: problems.map((row) => ({
      ...row,
      // Thư đã ngừng thử không có lần gửi tiếp; thư đang gửi thì cột này là hạn giữ chỗ, không phải lịch gửi.
      nextAttemptAt: row.status === "pending" ? row.nextAttemptAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
