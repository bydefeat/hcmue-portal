import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { user } from "../authentication/authentication.schema";
import { classSections, enrollments, terms } from "../course-registration/course-registration.schema";
import { rooms } from "../facilities/facilities.schema";
import { lecturers } from "../users/users.schema";

export const examKindEnum = pgEnum("exam_kind", ["midterm", "final"]);
export const examFormatEnum = pgEnum("exam_format", ["written", "multiple-choice", "practical", "oral", "project"]);
export const examSessionStatusEnum = pgEnum("exam_session_status", ["draft", "published", "done"]);
export const examPaperStatusEnum = pgEnum("exam_paper_status", ["not-submitted", "submitted", "approved"]);

export const examSessions = pgTable(
  "exam_sessions",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    kind: examKindEnum().notNull(),
    format: examFormatEnum().notNull(),
    date: date({ mode: "string" }).notNull(),
    startTime: time().notNull(),
    durationMinutes: smallint().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    status: examSessionStatusEnum().notNull().default("draft"),
    paperStatus: examPaperStatusEnum().notNull().default("not-submitted"),
    paperDeadline: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique().on(table.classSectionId, table.kind),
    index().on(table.termId, table.date),
    index().on(table.roomId, table.date),
    check("exam_sessions_duration_range", sql`${table.durationMinutes} BETWEEN 15 AND 240`),
  ],
);

export const examProctors = pgTable(
  "exam_proctors",
  {
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    lecturerId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.examSessionId, table.lecturerId] }), index().on(table.lecturerId)],
);

export const examEligibilityOverrides = pgTable(
  "exam_eligibility_overrides",
  {
    id: primaryId(),
    enrollmentId: uuid()
      .notNull()
      .unique()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decidedAt: createdAt(),
  },
  (table) => [index().on(table.decidedByUserId)],
);
