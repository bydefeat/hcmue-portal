import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";

export const genderEnum = pgEnum("gender", ["female", "male"]);
export const studentStatusEnum = pgEnum("student_status", ["studying", "reserved", "suspended", "graduated", "withdrawn"]);
export const lecturerStatusEnum = pgEnum("lecturer_status", ["active", "on-leave"]);
export const decisionKindEnum = pgEnum("decision_kind", ["reserve", "resume", "suspend", "expel", "major-change", "reward", "discipline", "graduate"]);
export const decisionStatusEnum = pgEnum("decision_status", ["draft", "pending-signature", "signed", "revoked"]);
export const disciplineLevelEnum = pgEnum("discipline_level", ["reprimand", "warning", "suspension"]);

export const lecturers = pgTable(
  "lecturers",
  {
    id: primaryId(),
    userId: uuid()
      .unique("lecturers_user_id_unique")
      .references(() => user.id, { onDelete: "set null" }),
    code: text().notNull().unique("lecturers_code_unique"),
    fullName: text().notNull(),
    title: text().notNull(),
    gender: genderEnum().notNull(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: "restrict" }),
    email: text().notNull().unique("lecturers_email_unique"),
    phone: text().notNull().default(""),
    personalEmail: text().notNull().default(""),
    office: text().notNull().default(""),
    officeHours: text().notNull().default(""),
    status: lecturerStatusEnum().notNull().default("active"),
    ...timestamps(),
  },
  (table) => [index().on(table.facultyId)],
);

export const staffMembers = pgTable("staff_members", {
  id: primaryId(),
  userId: uuid()
    .unique("staff_members_user_id_unique")
    .references(() => user.id, { onDelete: "set null" }),
  code: text().notNull().unique("staff_members_code_unique"),
  fullName: text().notNull(),
  unit: text().notNull(),
  email: text().notNull().unique("staff_members_email_unique"),
  ...timestamps(),
});

export const administrativeClasses = pgTable(
  "administrative_classes",
  {
    id: primaryId(),
    code: text().notNull().unique("administrative_classes_code_unique"),
    majorId: uuid()
      .notNull()
      .references(() => majors.id, { onDelete: "restrict" }),
    cohort: smallint().notNull(),
    advisorId: uuid().references(() => lecturers.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [index().on(table.majorId, table.cohort), index().on(table.advisorId)],
);

export const students = pgTable(
  "students",
  {
    id: primaryId(),
    userId: uuid()
      .unique("students_user_id_unique")
      .references(() => user.id, { onDelete: "set null" }),
    code: text().notNull().unique("students_code_unique"),
    fullName: text().notNull(),
    gender: genderEnum().notNull(),
    dateOfBirth: date({ mode: "string" }).notNull(),
    email: text().notNull().unique("students_email_unique"),
    phone: text().notNull().default(""),
    hometown: text().notNull().default(""),
    personalEmail: text().notNull().default(""),
    address: text().notNull().default(""),
    emergencyContactName: text().notNull().default(""),
    emergencyContactPhone: text().notNull().default(""),
    administrativeClassId: uuid()
      .notNull()
      .references(() => administrativeClasses.id, { onDelete: "restrict" }),
    status: studentStatusEnum().notNull().default("studying"),
    ...timestamps(),
  },
  (table) => [index().on(table.administrativeClassId), index().on(table.status)],
);

export const studentDecisions = pgTable(
  "student_decisions",
  {
    id: primaryId(),
    number: text(),
    kind: decisionKindEnum().notNull(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    title: text().notNull(),
    basis: text().notNull(),
    effectiveDate: date({ mode: "string" }).notNull(),
    status: decisionStatusEnum().notNull().default("draft"),
    disciplineLevel: disciplineLevelEnum(),
    targetClassId: uuid().references(() => administrativeClasses.id, { onDelete: "restrict" }),
    previousStatus: studentStatusEnum(),
    previousClassId: uuid().references(() => administrativeClasses.id, { onDelete: "set null" }),
    appliedAt: timestamp({ withTimezone: true }),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    signedBy: text(),
    signedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    signedAt: timestamp({ withTimezone: true }),
    returnReason: text(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    revokedBy: text(),
    revokeReason: text(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex().on(table.number),
    index().on(table.studentId),
    index().on(table.targetClassId),
    index().on(table.previousClassId),
    index().on(table.status, table.effectiveDate),
    check("student_decisions_signed_fields", sql`(${table.status} IN ('signed', 'revoked')) = (${table.number} IS NOT NULL AND ${table.signedAt} IS NOT NULL)`),
    check("student_decisions_discipline_level", sql`(${table.kind} = 'discipline') = (${table.disciplineLevel} IS NOT NULL)`),
    check("student_decisions_major_change_target", sql`(${table.kind} = 'major-change') = (${table.targetClassId} IS NOT NULL)`),
    check("student_decisions_revoked_fields", sql`(${table.status} = 'revoked') = (${table.revokedAt} IS NOT NULL AND ${table.revokeReason} IS NOT NULL)`),
    check("student_decisions_applied_signed", sql`${table.appliedAt} IS NULL OR ${table.status} IN ('signed', 'revoked')`),
    check("student_decisions_signer_not_creator", sql`${table.signedByUserId} IS NULL OR ${table.createdByUserId} IS NULL OR ${table.signedByUserId} <> ${table.createdByUserId}`),
  ],
);

export const lecturerLoadNorms = pgTable(
  "lecturer_load_norms",
  {
    id: primaryId(),
    title: text().notNull().unique("lecturer_load_norms_title_unique"),
    normHours: smallint().notNull(),
    ...timestamps(),
  },
  (table) => [check("lecturer_load_norms_hours_positive", sql`${table.normHours} > 0`)],
);
