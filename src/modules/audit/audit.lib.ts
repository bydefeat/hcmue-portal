import "server-only";
import { headers } from "next/headers";
import { lt } from "drizzle-orm";
import { clientIpFrom } from "@/shared/libs/client-ip.lib";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { env } from "@/shared/libs/env.lib";
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
  // Bỏ trống thì lấy IP của request hiện tại, cùng header tin cậy với rate limit đăng nhập (client-ip.lib).
  ip?: string | null;
};

// Người thao tác ở cổng quản trị: tên và vai trò đang dùng (viewer.roleName đã kèm khoa nếu phạm vi theo khoa).
export function auditActorOf(viewer: { id: string; name: string; roleName: string }): AuditActor {
  return { userId: viewer.id, name: viewer.name, role: viewer.roleName };
}

async function requestIp() {
  try {
    return clientIpFrom(await headers());
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

// Tác vụ audit-cleanup: xóa bản ghi nhật ký cũ hơn DEFEAT_AUDIT_RETENTION_DAYS ngày (mặc định 3 năm). Nhật ký không sửa được,
// chỉ hết hạn lưu theo cấu hình.
export async function purgeOldAuditLogs(executor: Transaction | typeof db = db, now = new Date(), retentionDays = env.DEFEAT_AUDIT_RETENTION_DAYS) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 3_600_000);
  const removed = await executor.delete(auditLogs).where(lt(auditLogs.at, cutoff)).returning({ id: auditLogs.id });
  return { auditLogsRemoved: removed.length };
}
