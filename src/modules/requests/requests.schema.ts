import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { lecturers, students } from "@/modules/users/users.schema";

export const requestKindEnum = pgEnum("request_kind", [
  "overload",
  "withdraw",
  "open-class",
  "regrade",
  "exam-postpone",
  "reserve",
  "transcript",
  "credit-transfer",
  "grade-change",
  "teaching-leave",
]);
export const stepRoleEnum = pgEnum("request_step_role", ["advisor", "lecturer", "faculty", "academic-office", "exam-office"]);
export const stepStatusEnum = pgEnum("request_step_status", ["waiting", "pending", "approved", "rejected", "skipped"]);

export type RequestDetailField = { label: string; value: string };

export const academicRequests = pgTable(
  "academic_requests",
  {
    id: primaryId(),
    code: text().notNull().unique("academic_requests_code_unique"),
    kind: requestKindEnum().notNull(),
    requesterStudentId: uuid().references(() => students.id, { onDelete: "restrict" }),
    requesterLecturerId: uuid().references(() => lecturers.id, { onDelete: "restrict" }),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: "restrict" }),
    subject: text().notNull(),
    details: jsonb().$type<RequestDetailField[]>().notNull().default(sql`'[]'::jsonb`),
    reason: text().notNull(),
    createdAt: createdAt(),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.requesterStudentId, table.createdAt),
    index().on(table.requesterLecturerId, table.createdAt),
    index().on(table.facultyId, table.createdAt),
    check("academic_requests_single_requester", sql`num_nonnulls(${table.requesterStudentId}, ${table.requesterLecturerId}) = 1`),
    check("academic_requests_details_array", sql`jsonb_typeof(${table.details}) = 'array'`),
  ],
);

export const requestSteps = pgTable(
  "request_steps",
  {
    id: primaryId(),
    requestId: uuid()
      .notNull()
      .references(() => academicRequests.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    role: stepRoleEnum().notNull(),
    label: text().notNull(),
    assigneeUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    status: stepStatusEnum().notNull().default("waiting"),
    dueAt: timestamp({ withTimezone: true }),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    actedAt: timestamp({ withTimezone: true }),
    comment: text(),
  },
  (table) => [
    unique("request_steps_request_id_position_unique").on(table.requestId, table.position),
    index().on(table.assigneeUserId, table.status),
    index().on(table.actorUserId),
    check("request_steps_position_positive", sql`${table.position} >= 1`),
    check("request_steps_acted_fields", sql`(${table.status} IN ('approved', 'rejected')) = (${table.actedAt} IS NOT NULL)`),
    check("request_steps_reject_comment", sql`${table.status} <> 'rejected' OR ${table.comment} IS NOT NULL`),
  ],
);

export const requestAttachments = pgTable(
  "request_attachments",
  {
    id: primaryId(),
    requestId: uuid()
      .notNull()
      .references(() => academicRequests.id, { onDelete: "cascade" }),
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    storageKey: text().notNull().unique("request_attachments_storage_key_unique"),
    uploadedAt: createdAt(),
  },
  (table) => [index().on(table.requestId), check("request_attachments_size_range", sql`${table.sizeBytes} BETWEEN 1 AND 10485760`)],
);
