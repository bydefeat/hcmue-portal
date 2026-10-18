import { mockDelay } from "@/shared/libs/mock-request.lib";
import { AUDIT_LOG } from "./audit.mock";
import type { AuditEntityType } from "./audit.type";

export async function getAuditLog(filter?: { entityType?: AuditEntityType; entityId?: string }) {
  await mockDelay();
  return AUDIT_LOG.filter(
    (entry) => (!filter?.entityType || entry.entityType === filter.entityType) && (!filter?.entityId || entry.entityId === filter.entityId),
  ).sort((a, b) => b.at.localeCompare(a.at));
}
