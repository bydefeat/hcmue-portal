import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { terms } from "@/modules/course-registration/course-registration.schema";
import type { RegulationSettings } from "@/modules/settings/settings.type";

export type RegulationRules = Pick<RegulationSettings, "grading" | "credits" | "warning" | "attendance" | "workflow" | "graduation">;

export const reportExportStatusEnum = pgEnum("report_export_status", ["queued", "running", "done", "failed"]);
export const calendarEventKindEnum = pgEnum("calendar_event_kind", ["teaching", "registration", "exam", "grading", "holiday", "event"]);

export const regulations = pgTable(
  "regulations",
  {
    id: primaryId(),
    version: text().notNull().unique("regulations_version_unique"),
    effectiveFrom: date({ mode: "string" }).notNull().unique("regulations_effective_from_unique"),
    decision: text().notNull(),
    summary: text().notNull(),
    rules: jsonb().$type<RegulationRules>().notNull(),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index().on(table.createdByUserId),
    check("regulations_rules_object", sql`jsonb_typeof(${table.rules}) = 'object' AND ${table.rules} ?& array['grading', 'credits', 'warning', 'attendance', 'workflow', 'graduation']`),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    kind: calendarEventKindEnum().notNull(),
    title: text().notNull(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    audience: text().notNull(),
    ...timestamps(),
  },
  (table) => [index().on(table.termId, table.startDate), check("calendar_events_date_order", sql`${table.startDate} <= ${table.endDate}`)],
);

export const reportExports = pgTable(
  "report_exports",
  {
    id: primaryId(),
    reportKey: text().notNull(),
    params: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: reportExportStatusEnum().notNull().default("queued"),
    requestedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    rowCount: integer(),
    storageKey: text().unique("report_exports_storage_key_unique"),
    fileName: text(),
    contentType: text(),
    sizeBytes: integer(),
    errorMessage: text(),
    createdAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.requestedByUserId, table.createdAt),
    index().on(table.status),
    check("report_exports_params_object", sql`jsonb_typeof(${table.params}) = 'object'`),
    check(
      "report_exports_done_fields",
      sql`(${table.status} = 'done') = (${table.storageKey} IS NOT NULL AND ${table.rowCount} IS NOT NULL AND ${table.fileName} IS NOT NULL AND ${table.contentType} IS NOT NULL AND ${table.sizeBytes} IS NOT NULL)`,
    ),
    index().on(table.createdAt),
    check("report_exports_failed_message", sql`${table.status} <> 'failed' OR ${table.errorMessage} IS NOT NULL`),
    check("report_exports_finished_fields", sql`(${table.status} IN ('done', 'failed')) = (${table.finishedAt} IS NOT NULL)`),
  ],
);
