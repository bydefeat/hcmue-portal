import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { AUDIT_CONSTRAINT_MESSAGE } from "@/modules/audit/audit.constant";
import { recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";
import { auditLogs } from "@/modules/audit/audit.schema";

after(() => db.$client.end());

describe("audit: ghi nhận thay đổi", () => {
  test("chỉ giữ trường đổi giá trị, đổi giá trị về chữ đọc được", () => {
    assert.deepEqual(
      auditChanges([
        ["Tiêu đề", "A", "A"],
        ["Ghim", false, true],
        ["Hạn chót", null, "17:00, 24/10/2026"],
        ["Tóm tắt", "", null],
        ["Sĩ số", 40, 45],
      ]),
      [
        { field: "Ghim", before: "Không", after: "Có" },
        { field: "Hạn chót", before: "Không có", after: "17:00, 24/10/2026" },
        { field: "Sĩ số", before: "40", after: "45" },
      ],
    );
  });

  test("recordAudit ghi trong transaction của thao tác, rollback thì không còn dòng nhật ký", async () => {
    const entityId = "audit-test-rollback";
    await db
      .transaction(async (tx) => {
        await recordAudit(tx, {
          actor: { userId: null, name: "Người thử", role: "Kiểm thử" },
          action: "update",
          entityType: "regulation",
          entityId,
          entityLabel: "Thử",
          summary: "Thử ghi nhật ký",
          changes: [{ field: "A", before: "1", after: "2" }],
        });
        const [row] = await tx.select().from(auditLogs).where(eq(auditLogs.entityId, entityId));
        assert.equal(row.actorLabel, "Người thử");
        assert.equal(row.ip, null);
        assert.deepEqual(row.changes, [{ field: "A", before: "1", after: "2" }]);
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
    const rows = await db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId));
    assert.equal(rows.length, 0);
  });

  test("danh sách thay đổi phải là mảng", async () => {
    const [row] = await db.select().from(auditLogs).limit(1);
    const error = await db
      .update(auditLogs)
      .set({ changes: sql`'{}'::jsonb` })
      .where(eq(auditLogs.id, row.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, AUDIT_CONSTRAINT_MESSAGE), AUDIT_CONSTRAINT_MESSAGE.audit_logs_changes_array);
  });
});
