import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { lecturers, students } from "@/modules/users/users.schema";

export const appointmentModeEnum = pgEnum("appointment_mode", ["in-person", "online"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["scheduled", "done", "missed", "cancelled"]);
// Có mặt hay vắng của từng sinh viên trong buổi hẹn (buổi nhóm ghi theo từng người); trống là chưa ghi nhận.
export const appointmentAttendanceEnum = pgEnum("appointment_attendance", ["present", "absent"]);

export const advisingAppointments = pgTable(
  "advising_appointments",
  {
    id: primaryId(),
    advisorId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "cascade" }),
    topic: text().notNull(),
    date: date({ mode: "string" }).notNull(),
    startTime: time().notNull(),
    durationMinutes: smallint().notNull(),
    mode: appointmentModeEnum().notNull(),
    location: text().notNull(),
    status: appointmentStatusEnum().notNull().default("scheduled"),
    note: text(),
    ...timestamps(),
  },
  (table) => [
    index().on(table.advisorId, table.date),
    check("advising_appointments_duration_range", sql`${table.durationMinutes} BETWEEN 5 AND 240`),
    check("advising_appointments_done_note", sql`${table.status} <> 'done' OR ${table.note} IS NOT NULL`),
  ],
);

export const appointmentStudents = pgTable(
  "appointment_students",
  {
    appointmentId: uuid()
      .notNull()
      .references(() => advisingAppointments.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    attendance: appointmentAttendanceEnum(),
  },
  (table) => [primaryKey({ columns: [table.appointmentId, table.studentId] }), index().on(table.studentId)],
);

export const advisingNotes = pgTable(
  "advising_notes",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Ghi chú từ buổi hẹn trỏ về buổi đó; ghi chú độc lập (gọi điện, gặp ngoài lịch) để trống.
    appointmentId: uuid().references(() => advisingAppointments.id, { onDelete: "set null" }),
    topic: text().notNull(),
    content: text().notNull(),
    followUp: text(),
  },
  (table) => [
    index().on(table.studentId, table.at),
    index().on(table.authorId),
    index().on(table.appointmentId),
    check("advising_notes_content_present", sql`length(btrim(${table.topic})) BETWEEN 1 AND 200 AND length(btrim(${table.content})) BETWEEN 1 AND 1000`),
  ],
);
