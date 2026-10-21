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
