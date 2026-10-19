import { mockDelay } from "@/shared/libs/mock-request.lib";
import { AUDIT_LOG } from "@/modules/audit/audit.mock";
import type { AuditEntityType } from "@/modules/audit/audit.type";

export async function getAuditLog(filter?: { entityType?: AuditEntityType; entityId?: string }) {
  await mockDelay();
  return AUDIT_LOG.filter(
    (entry) => (!filter?.entityType || entry.entityType === filter.entityType) && (!filter?.entityId || entry.entityId === filter.entityId),
  ).toSorted((a, b) => b.at.localeCompare(a.at));
}
