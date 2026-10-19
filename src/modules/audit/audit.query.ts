import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { user } from "@/modules/authentication/authentication.schema";
import { auditLogs } from "@/modules/audit/audit.schema";
import type { AuditEntityType, AuditEntry } from "@/modules/audit/audit.type";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { lecturers } from "@/modules/users/users.schema";

type AuditFilter = { entityType?: AuditEntityType; entityId?: string; actorUserId?: string };

// Giảng viên chỉ xem lịch sử bảng điểm của lớp mình dạy.
async function teachesSection(userId: string, sectionId: string) {
  if (!isUuid(sectionId)) return false;
  const [row] = await db
    .select({ id: classSections.id })
    .from(classSections)
    .innerJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
    .where(and(eq(classSections.id, sectionId), eq(lecturers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

// Cả nhật ký cần quyền audit.view; lịch sử của một đối tượng thì cán bộ quản trị nào cũng xem được ở trang đối tượng đó;
// nhật ký của chính mình (trang hồ sơ) ai cũng xem được.
async function guard(filter: AuditFilter | undefined) {
  const session = await requireSession();
  const isOwn = filter?.actorUserId !== undefined && filter.actorUserId === session.user.id;
  const isEntity = filter?.entityType !== undefined && filter.entityId !== undefined;
  if (session.roles.includes("admin")) {
    if (!isOwn && !isEntity) await requirePermission("audit.view");
    return;
  }
  if (session.roles.includes("lecturer") && filter?.entityType === "grade-sheet" && filter.entityId && (await teachesSection(session.user.id, filter.entityId))) return;
  if (isOwn) return;
  forbidden();
}

export async function getAuditLog(filter?: AuditFilter): Promise<AuditEntry[]> {
  await guard(filter);
  if (filter?.actorUserId !== undefined && !isUuid(filter.actorUserId)) return [];
  const conditions: SQL[] = [];
  if (filter?.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
  if (filter?.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
  if (filter?.actorUserId) conditions.push(eq(auditLogs.actorUserId, filter.actorUserId));
  const rows = await db
    .select({
      id: auditLogs.id,
      at: auditLogs.at,
      actorLabel: auditLogs.actorLabel,
      actorName: user.name,
      actorRole: auditLogs.actorRole,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      entityLabel: auditLogs.entityLabel,
      summary: auditLogs.summary,
      changes: auditLogs.changes,
      ip: auditLogs.ip,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.at), desc(auditLogs.id))
    .limit(2000);
  // Tên người thao tác lấy theo tài khoản hiện tại; tài khoản đã xóa thì giữ tên lưu lúc ghi.
  return rows.map(({ at, actorLabel, actorName, ip, ...row }) => ({ ...row, at: at.toISOString(), actorName: actorName ?? actorLabel, ip: ip ?? "" }));
}
