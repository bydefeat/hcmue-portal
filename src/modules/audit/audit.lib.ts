import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { auditLogs } from "@/modules/audit/audit.schema";
import type { AuditAction, AuditChange, AuditEntityType } from "@/modules/audit/audit.type";

export type AuditActor = { userId: string | null; name: string; role: string };

export type AuditRecord = {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  summary: string;
  changes?: AuditChange[];
  // Bỏ trống thì lấy IP của request hiện tại (x-forwarded-for do reverse proxy ghi đè).
  ip?: string | null;
};

// Người thao tác ở cổng quản trị: tên và vai trò đang dùng (viewer.roleName đã kèm khoa nếu phạm vi theo khoa).
export function auditActorOf(viewer: { id: string; name: string; roleName: string }): AuditActor {
  return { userId: viewer.id, name: viewer.name, role: viewer.roleName };
}

async function requestIp() {
  try {
    const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded && isIP(forwarded) ? forwarded : null;
  } catch {
    // Ngoài request (script, test) không có headers.
    return null;
  }
}

// Ghi nhật ký trong cùng transaction với thao tác: thao tác rollback thì dòng nhật ký cũng mất, không ghi nhận việc chưa xảy ra.
export async function recordAudit(tx: Transaction | typeof db, record: AuditRecord) {
  const ip = record.ip === undefined ? await requestIp() : record.ip;
  await tx.insert(auditLogs).values({
    actorUserId: record.actor.userId,
    actorLabel: record.actor.name,
    actorRole: record.actor.role,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    entityLabel: record.entityLabel,
    summary: record.summary,
    changes: record.changes ?? [],
    ip,
  });
}
