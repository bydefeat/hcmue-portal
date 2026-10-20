import "server-only";
import { and, count, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { forbidden } from "next/navigation";
import { db } from "@/shared/libs/db.lib";
import { dayjs, SCHOOL_TIMEZONE } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { AUDIT_PAGE_SIZE } from "@/modules/audit/audit.constant";
import { auditLogs } from "@/modules/audit/audit.schema";
import type { AuditAction, AuditEntityType, AuditEntry, AuditPage } from "@/modules/audit/audit.type";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

type AuditFilter = { entityType?: AuditEntityType; entityId?: string; actorUserId?: string };

const COLUMNS = {
  id: auditLogs.id,
  at: auditLogs.at,
  // Tên người thao tác là nhãn lưu lúc ghi: đổi tên tài khoản sau đó không sửa ngược được nhật ký.
  actorName: auditLogs.actorLabel,
  actorRole: auditLogs.actorRole,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  entityLabel: auditLogs.entityLabel,
  summary: auditLogs.summary,
  changes: auditLogs.changes,
  ip: auditLogs.ip,
};

type Row = { at: Date; ip: string | null } & Omit<AuditEntry, "at" | "ip">;

const toEntry = ({ at, ip, ...row }: Row): AuditEntry => ({ ...row, at: at.toISOString(), ip: ip ?? "" });

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

async function studentFaculty(studentId: string) {
  if (!isUuid(studentId)) return null;
  const [row] = await db
    .select({ faculty: faculties.name })
    .from(students)
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .where(eq(students.id, studentId));
  return row?.faculty ?? null;
}

// Cả nhật ký cần quyền audit.view. Lịch sử của một đối tượng thì cần quyền xem chính đối tượng đó trong phạm vi khoa (hồ sơ
// sinh viên: students.view và sinh viên thuộc khoa của vai trò); đối tượng khác chỉ người có audit.view. Nhật ký của chính
// mình (trang hồ sơ) ai cũng xem được.
async function guard(filter: AuditFilter | undefined) {
  const session = await requireSession();
  if (filter?.actorUserId !== undefined && filter.actorUserId === session.user.id) return;
  const isEntity = filter?.entityType !== undefined && filter.entityId !== undefined;
  if (session.roles.includes("admin")) {
    const viewer = await getViewer();
    if (can(viewer, "audit.view") && viewer.faculty === null) return;
    if (isEntity && filter.entityType === "student" && can(viewer, "students.view")) {
      const faculty = await studentFaculty(filter.entityId!);
      if (faculty && inScope(viewer, faculty)) return;
    }
    if (!isEntity && !filter?.actorUserId) await requirePermission("audit.view");
    else forbidden();
    return;
  }
  if (session.roles.includes("lecturer") && filter?.entityType === "grade-sheet" && filter.entityId && (await teachesSection(session.user.id, filter.entityId))) return;
  forbidden();
}

// Lịch sử một đối tượng hoặc của chính người xem (200 bản ghi mới nhất).
export async function getAuditLog(filter?: AuditFilter): Promise<AuditEntry[]> {
  await guard(filter);
  if (filter?.actorUserId !== undefined && !isUuid(filter.actorUserId)) return [];
  const conditions: SQL[] = [];
  if (filter?.entityType) conditions.push(eq(auditLogs.entityType, filter.entityType));
  if (filter?.entityId) conditions.push(eq(auditLogs.entityId, filter.entityId));
  if (filter?.actorUserId) conditions.push(eq(auditLogs.actorUserId, filter.actorUserId));
  const rows = await db
    .select(COLUMNS)
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.at), desc(auditLogs.id))
    .limit(200);
  return rows.map(toEntry);
}

export type AuditQuery = {
  page?: number;
  // Ngày "YYYY-MM-DD" theo giờ Việt Nam, tính trọn ngày.
  from?: string;
  to?: string;
  actor?: string;
  action?: AuditAction;
  entityType?: AuditEntityType;
  entityId?: string;
  q?: string;
};

const day = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayjs.tz(value, SCHOOL_TIMEZONE) : null);

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Trang Nhật ký thao tác: lọc ở DB theo thời gian, người, đối tượng, hành động, phân trang.
export async function getAuditLogPage(query: AuditQuery): Promise<AuditPage> {
  await requirePermission("audit.view");
  const conditions: (SQL | undefined)[] = [];
  const from = day(query.from);
  const to = day(query.to);
  if (from) conditions.push(gte(auditLogs.at, from.toDate()));
  if (to) conditions.push(lt(auditLogs.at, to.add(1, "day").toDate()));
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(auditLogs.entityId, query.entityId));
  if (query.actor?.trim()) conditions.push(ilike(auditLogs.actorLabel, `%${escapeLike(query.actor.trim())}%`));
  if (query.q?.trim()) {
    const needle = `%${escapeLike(query.q.trim())}%`;
    conditions.push(or(ilike(auditLogs.entityLabel, needle), ilike(auditLogs.summary, needle)));
  }
  const where = and(...conditions);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(COLUMNS)
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return { entries: rows.map(toEntry), total, page, pageSize: AUDIT_PAGE_SIZE };
}
