import { sql } from "drizzle-orm";
import { check, index, inet, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import type { AuditChange } from "@/modules/audit/audit.type";

export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete", "approve", "reject", "publish", "lock", "assign", "export", "sign-in", "permission"]);
export const auditEntityTypeEnum = pgEnum("audit_entity_type", [
  "student",
  "lecturer",
  "grade-sheet",
  "class-section",
  "registration-period",
  "request",
  "decision",
  "announcement",
  "role",
  "regulation",
  "exam",
  "calendar-event",
  "report",
  "program",
]);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryId(),
    at: createdAt(),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    actorLabel: text().notNull(),
    actorRole: text().notNull(),
    action: auditActionEnum().notNull(),
    entityType: auditEntityTypeEnum().notNull(),
    entityId: text().notNull(),
    entityLabel: text().notNull(),
    summary: text().notNull(),
    changes: jsonb().$type<AuditChange[]>().notNull().default(sql`'[]'::jsonb`),
    ip: inet(),
  },
  (table) => [
    index().on(table.at),
    index().on(table.entityType, table.entityId),
    index().on(table.actorUserId, table.at),
    check("audit_logs_changes_array", sql`jsonb_typeof(${table.changes}) = 'array'`),
  ],
);
