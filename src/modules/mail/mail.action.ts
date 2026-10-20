"use server";

import { revalidatePath } from "next/cache";
import { and, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { requireSchoolWidePermission } from "@/modules/access/access.query";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { MAIL_CONSTRAINT_MESSAGE, MAIL_OUTBOX_HREF } from "@/modules/mail/mail.constant";
import { deliverMailSoon } from "@/modules/mail/mail.lib";
import { MAIL_RETRY_SCHEMA, type MailRetryInput } from "@/modules/mail/mail.rule";
import { mailOutbox } from "@/modules/mail/mail.schema";

// Gửi lại thư lỗi (đã ngừng thử hoặc đang chờ gửi lại): đếm lại số lần thử từ đầu và gửi ngay sau khi trả phản hồi.
// Thư đang gửi dở không đụng tới để không gửi trùng.
export async function retryMail(input: MailRetryInput): Promise<ActionResult<{ retried: number }>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  const parsed = parseInput(MAIL_RETRY_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let ids: string[];
  try {
    ids = await db.transaction(async (tx) => {
      const rows = await tx
        .update(mailOutbox)
        .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null })
        .where(and(inArray(mailOutbox.id, parsed.data.ids), inArray(mailOutbox.status, ["failed", "pending"])))
        .returning({ id: mailOutbox.id, recipient: mailOutbox.recipient });
      if (rows.length > 0) {
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "update",
          entityType: "mail",
          entityId: rows.length === 1 ? rows[0].id : "many",
          entityLabel: rows.length === 1 ? `Thư tới ${rows[0].recipient}` : `${rows.length} thư`,
          summary: `Gửi lại ${rows.length} thư lỗi (đếm lại số lần thử từ đầu)`,
        });
      }
      return rows.map((row) => row.id);
    });
  } catch (error) {
    return actionFailure(error, MAIL_CONSTRAINT_MESSAGE);
  }
  if (ids.length === 0) return actionError("Các thư đã chọn đã gửi được hoặc đang gửi, tải lại trang.");
  deliverMailSoon(ids);
  revalidatePath(MAIL_OUTBOX_HREF);
  return actionOk({ retried: ids.length });
}
