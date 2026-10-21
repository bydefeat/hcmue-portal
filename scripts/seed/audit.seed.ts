import type { Transaction } from "@/shared/libs/db.lib";
import { AUDIT_LOG } from "@/modules/audit/audit.mock";
import { auditLogs } from "@/modules/audit/audit.schema";
import { ADMIN } from "./people.seed";
import type { SeedContext } from "./context";

export async function seedAudit(tx: Transaction, context: SeedContext) {
  await tx.insert(auditLogs).values(
    AUDIT_LOG.map(({ at, actorName, ip, ...entry }) => ({
      ...entry,
      at: new Date(at),
      actorUserId: actorName === ADMIN.name ? context.adminUserId : null,
      actorLabel: actorName,
      ip: ip || null,
    })),
  );
  return { auditLogs: AUDIT_LOG.length };
}
