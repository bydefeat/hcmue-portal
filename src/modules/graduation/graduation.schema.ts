import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { user } from "../authentication/authentication.schema";
import { studentDecisions, students } from "../users/users.schema";

export const graduationRecordStatusEnum = pgEnum("graduation_record_status", ["pending", "approved", "graduated"]);

export const graduationRecords = pgTable(
  "graduation_records",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .unique("graduation_records_student_id_unique")
      .references(() => students.id, { onDelete: "cascade" }),
    languageCertificate: text(),
    itCertificate: text(),
    status: graduationRecordStatusEnum().notNull().default("pending"),
    decidedAt: timestamp({ withTimezone: true }),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decisionId: uuid()
      .unique("graduation_records_decision_id_unique")
      .references(() => studentDecisions.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [check("graduation_records_decided_fields", sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL)`)],
);
