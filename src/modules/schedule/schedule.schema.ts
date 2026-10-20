import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, updatedAt } from "@/shared/libs/db-column.lib";
import { classSections, enrollments, labGroups } from "@/modules/course-registration/course-registration.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { academicRequests } from "@/modules/requests/requests.schema";

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

// Buổi học nghỉ theo đơn nghỉ dạy đã duyệt: giống ngày nghỉ lễ, lịch buổi học bỏ khung này (không điểm danh, không tính vào số
// buổi đã học) và trang điểm danh liệt kê là buổi cần dạy bù. Khóa theo khung lịch tuần (ngày, tiết bắt đầu, nhóm) như class_sessions.
export const classSessionLeaves = pgTable(
  "class_session_leaves",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    labGroupId: uuid(),
    date: date({ mode: "string" }).notNull(),
    startPeriod: smallint().notNull(),
    endPeriod: smallint().notNull(),
    reason: text().notNull(),
    // Lịch dạy bù giảng viên đề xuất trong đơn, Phòng Đào tạo xếp phòng theo đó.
    makeupNote: text().notNull().default(""),
    requestId: uuid().references(() => academicRequests.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("class_session_leaves_slot_unique").on(table.classSectionId, table.date, table.startPeriod, table.labGroupId).nullsNotDistinct(),
    foreignKey({
      name: "class_session_leaves_lab_group_fk",
      columns: [table.labGroupId, table.classSectionId],
      foreignColumns: [labGroups.id, labGroups.classSectionId],
    }).onDelete("cascade"),
    index().on(table.requestId),
    index().on(table.labGroupId),
    check("class_session_leaves_period_range", sql`${table.startPeriod} >= 1 AND ${table.endPeriod} <= 12 AND ${table.startPeriod} <= ${table.endPeriod}`),
    check("class_session_leaves_reason_present", sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`),
  ],
);
