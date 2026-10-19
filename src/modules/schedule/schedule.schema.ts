import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgEnum, pgTable, primaryKey, smallint, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, updatedAt } from "@/shared/libs/db-column.lib";
import { classSections, enrollments, labGroups } from "@/modules/course-registration/course-registration.schema";
import { rooms } from "@/modules/facilities/facilities.schema";

export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "late", "excused", "absent"]);

export const classSessions = pgTable(
  "class_sessions",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    // Buổi của nhóm thực hành; null là buổi lý thuyết của cả lớp.
    labGroupId: uuid(),
    date: date({ mode: "string" }).notNull(),
    startPeriod: smallint().notNull(),
    endPeriod: smallint().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    takenAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique("class_sessions_slot_unique").on(table.classSectionId, table.date, table.startPeriod, table.labGroupId).nullsNotDistinct(),
    foreignKey({
      name: "class_sessions_lab_group_fk",
      columns: [table.labGroupId, table.classSectionId],
      foreignColumns: [labGroups.id, labGroups.classSectionId],
    }).onDelete("cascade"),
    index().on(table.labGroupId),
    index().on(table.roomId, table.date),
    check("class_sessions_period_range", sql`${table.startPeriod} >= 1 AND ${table.endPeriod} <= 12 AND ${table.startPeriod} <= ${table.endPeriod}`),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    classSessionId: uuid()
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.classSessionId, table.enrollmentId] }), index().on(table.enrollmentId)],
);
