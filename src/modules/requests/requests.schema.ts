import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createdAt, primaryId } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections } from "@/modules/course-registration/course-registration.schema";
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
    classSectionId: uuid().references(() => classSections.id, { onDelete: "set null" }),
    resubmittedFromId: uuid().references((): AnyPgColumn => academicRequests.id, { onDelete: "set null" }),
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
    index().on(table.classSectionId),
    uniqueIndex("academic_requests_resubmitted_from_unique").on(table.resubmittedFromId).where(sql`${table.resubmittedFromId} IS NOT NULL`),
    check("academic_requests_single_requester", sql`num_nonnulls(${table.requesterStudentId}, ${table.requesterLecturerId}) = 1`),
    check("academic_requests_details_array", sql`jsonb_typeof(${table.details}) = 'array'`),
    check("academic_requests_code_format", sql`${table.code} ~ '^(DT|GV)-[0-9]{4}-[0-9]{5}$'`),
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
    assigneeLecturerId: uuid().references(() => lecturers.id, { onDelete: "restrict" }),
    status: stepStatusEnum().notNull().default("waiting"),
    dueAt: timestamp({ withTimezone: true }),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    actorName: text(),
    actedAt: timestamp({ withTimezone: true }),
    comment: text(),
    onBehalf: boolean().notNull().default(false),
    reassignedAt: timestamp({ withTimezone: true }),
    reassignedByName: text(),
    reassignReason: text(),
    dueSoonNotifiedAt: timestamp({ withTimezone: true }),
    overdueNotifiedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique("request_steps_request_id_position_unique").on(table.requestId, table.position),
    index().on(table.assigneeLecturerId, table.status),
    index().on(table.actorUserId),
    uniqueIndex("request_steps_one_pending").on(table.requestId).where(sql`${table.status} = 'pending'`),
    check("request_steps_position_positive", sql`${table.position} >= 1`),
    index("request_steps_pending_due_at").on(table.dueAt).where(sql`${table.status} = 'pending'`),
    check("request_steps_acted_fields", sql`(${table.status} IN ('approved', 'rejected', 'skipped')) = (${table.actedAt} IS NOT NULL)`),
    check("request_steps_actor_name", sql`(${table.actedAt} IS NULL) = (${table.actorName} IS NULL)`),
    check("request_steps_reject_comment", sql`${table.status} <> 'rejected' OR ${table.comment} IS NOT NULL`),
    check("request_steps_pending_due", sql`${table.status} <> 'pending' OR ${table.dueAt} IS NOT NULL`),
    check(
      "request_steps_lecturer_assignee",
      sql`(${table.role} <> 'lecturer' OR ${table.assigneeLecturerId} IS NOT NULL) AND (${table.role} IN ('advisor', 'lecturer') OR ${table.assigneeLecturerId} IS NULL)`,
    ),
    check("request_steps_reassign_fields", sql`(${table.reassignedAt} IS NULL) = (${table.reassignedByName} IS NULL) AND (${table.reassignedAt} IS NULL) = (${table.reassignReason} IS NULL)`),
    check("request_steps_on_behalf_reason", sql`NOT ${table.onBehalf} OR (${table.actedAt} IS NOT NULL AND ${table.comment} IS NOT NULL)`),
    check("request_steps_skipped_on_behalf", sql`${table.status} <> 'skipped' OR ${table.onBehalf}`),
  ],
);

export const requestSupplements = pgTable(
  "request_supplements",
  {
    id: primaryId(),
    requestId: uuid()
      .notNull()
      .references(() => academicRequests.id, { onDelete: "cascade" }),
    stepId: uuid()
      .notNull()
      .references(() => requestSteps.id, { onDelete: "cascade" }),
    requestedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    requestedByName: text().notNull(),
    requestNote: text().notNull(),
    requestedAt: createdAt(),
    respondedAt: timestamp({ withTimezone: true }),
    responseNote: text(),
  },
  (table) => [
    index().on(table.requestId, table.requestedAt),
    index().on(table.stepId),
    index().on(table.requestedByUserId),
    uniqueIndex("request_supplements_one_open").on(table.requestId).where(sql`${table.respondedAt} IS NULL`),
    check("request_supplements_note_not_blank", sql`btrim(${table.requestNote}) <> ''`),
    check("request_supplements_response_fields", sql`${table.respondedAt} IS NOT NULL OR ${table.responseNote} IS NULL`),
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

export const requestCodeCounters = pgTable(
  "request_code_counters",
  {
    prefix: text().notNull(),
    year: smallint().notNull(),
    lastValue: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.prefix, table.year] }),
    check("request_code_counters_last_value_range", sql`${table.lastValue} BETWEEN 1 AND 99999`),
  ],
);

export const requestDocuments = pgTable(
  "request_documents",
  {
    id: primaryId(),
    requestId: uuid()
      .notNull()
      .references(() => academicRequests.id, { onDelete: "cascade" }),
    title: text().notNull(),
    fileName: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    storageKey: text().notNull().unique("request_documents_storage_key_unique"),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.requestId), check("request_documents_size_range", sql`${table.sizeBytes} BETWEEN 1 AND 20971520`)],
);
