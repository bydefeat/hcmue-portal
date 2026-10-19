import { sql } from "drizzle-orm";
import { check, date, index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { user } from "../authentication/authentication.schema";
import { terms } from "../course-registration/course-registration.schema";
import type { RegulationSettings } from "./settings.type";

export type RegulationRules = Pick<RegulationSettings, "grading" | "credits" | "warning" | "attendance" | "workflow">;

export const calendarEventKindEnum = pgEnum("calendar_event_kind", ["teaching", "registration", "exam", "grading", "holiday", "event"]);

export const regulations = pgTable(
  "regulations",
  {
    id: primaryId(),
    version: text().notNull().unique(),
    effectiveFrom: date({ mode: "string" }).notNull().unique(),
    decision: text().notNull(),
    summary: text().notNull(),
    rules: jsonb().$type<RegulationRules>().notNull(),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index().on(table.createdByUserId),
    check("regulations_rules_object", sql`jsonb_typeof(${table.rules}) = 'object' AND ${table.rules} ?& array['grading', 'credits', 'warning', 'attendance', 'workflow']`),
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
