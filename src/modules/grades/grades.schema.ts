import { sql } from "drizzle-orm";
import { check, foreignKey, index, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps, updatedAt } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { academicRequests } from "@/modules/requests/requests.schema";
import { students } from "@/modules/users/users.schema";

export const gradeSheetStatusEnum = pgEnum("grade_sheet_status", ["draft", "locked", "approved", "published", "returned"]);
export const courseResultSourceEnum = pgEnum("course_result_source", ["class", "transfer", "exemption", "legacy"]);
export const warningStatusEnum = pgEnum("warning_status", ["new", "notified", "resolved"]);
export const gradeAmendmentSourceEnum = pgEnum("grade_amendment_source", ["regrade", "grade-change", "manual"]);
export const gradeAmendmentStatusEnum = pgEnum("grade_amendment_status", ["pending", "approved", "rejected"]);

const LETTERS = sql.raw(`'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F', 'W', 'I', 'M'`);
const MARKS = sql.raw(`'W', 'I', 'M'`);

export const gradeSheets = pgTable(
  "grade_sheets",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .unique("grade_sheets_class_section_id_unique")
      .references(() => classSections.id, { onDelete: "cascade" }),
    status: gradeSheetStatusEnum().notNull().default("draft"),
    deadline: timestamp({ withTimezone: true }).notNull(),
    savedAt: timestamp({ withTimezone: true }),
    lockedAt: timestamp({ withTimezone: true }),
    approvedAt: timestamp({ withTimezone: true }),
    approvedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp({ withTimezone: true }),
    publishedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    returnReason: text(),
    ...timestamps(),
  },
  (table) => [
    index().on(table.status, table.deadline),
    index().on(table.approvedByUserId),
    index().on(table.publishedByUserId),
    check("grade_sheets_locked_after_draft", sql`${table.status} IN ('draft', 'returned') OR ${table.lockedAt} IS NOT NULL`),
    check("grade_sheets_published_fields", sql`(${table.status} = 'published') = (${table.publishedAt} IS NOT NULL)`),
    check("grade_sheets_return_reason", sql`${table.status} <> 'returned' OR ${table.returnReason} IS NOT NULL`),
  ],
);

export const gradeComponents = pgTable(
  "grade_components",
  {
    id: primaryId(),
    gradeSheetId: uuid()
      .notNull()
      .references(() => gradeSheets.id, { onDelete: "cascade" }),
    key: text().notNull(),
    label: text().notNull(),
    weight: smallint().notNull(),
    position: smallint().notNull(),
  },
  (table) => [
    unique("grade_components_grade_sheet_id_key_unique").on(table.gradeSheetId, table.key),
    unique("grade_components_grade_sheet_id_position_unique").on(table.gradeSheetId, table.position),
    check("grade_components_weight_range", sql`${table.weight} BETWEEN 1 AND 100`),
  ],
);

export const gradeScores = pgTable(
  "grade_scores",
  {
    gradeComponentId: uuid()
      .notNull()
      .references(() => gradeComponents.id, { onDelete: "cascade" }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    score: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.gradeComponentId, table.enrollmentId] }),
    index().on(table.enrollmentId),
    check("grade_scores_range", sql`${table.score} BETWEEN 0 AND 10`),
  ],
);

export const courseResults = pgTable(
  "course_results",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    enrollmentId: uuid().unique("course_results_enrollment_id_unique"),
    source: courseResultSourceEnum().notNull().default("class"),
    score10: numeric({ precision: 4, scale: 2, mode: "number" }),
    letter: text(),
    point4: numeric({ precision: 3, scale: 2, mode: "number" }),
    note: text().notNull().default(""),
    requestId: uuid().references(() => academicRequests.id, { onDelete: "set null" }),
    recordedAt: createdAt(),
  },
  (table) => [
    uniqueIndex().on(table.studentId, table.courseId, table.termId),
    foreignKey({
      name: "course_results_enrollment_fk",
      columns: [table.enrollmentId, table.studentId, table.courseId, table.termId],
      foreignColumns: [enrollments.id, enrollments.studentId, enrollments.courseId, enrollments.termId],
    }).onDelete("restrict"),
    index().on(table.courseId),
    index().on(table.termId),
    check("course_results_score_range", sql`${table.score10} IS NULL OR ${table.score10} BETWEEN 0 AND 10`),
    check("course_results_point_range", sql`${table.point4} IS NULL OR ${table.point4} BETWEEN 0 AND 4`),
    check("course_results_letter", sql`${table.letter} IS NULL OR ${table.letter} IN (${LETTERS})`),
    check("course_results_class_has_enrollment", sql`${table.source} <> 'class' OR ${table.enrollmentId} IS NOT NULL`),
    check(
      "course_results_graded_together",
      sql`(${table.score10} IS NULL) = (${table.point4} IS NULL) AND (${table.score10} IS NULL) = (${table.letter} IS NULL OR ${table.letter} IN (${MARKS}))`,
    ),
    check("course_results_exemption_mark", sql`(${table.source} = 'exemption') = (${table.letter} IS NOT DISTINCT FROM 'M')`),
    check("course_results_class_marks", sql`${table.letter} IS NULL OR ${table.letter} NOT IN ('W', 'I') OR ${table.source} = 'class'`),
    index().on(table.requestId),
  ],
);

export const academicWarnings = pgTable(
  "academic_warnings",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    level: smallint().notNull(),
    termGpa4: numeric({ precision: 3, scale: 2, mode: "number" }).notNull(),
    cpa4: numeric({ precision: 3, scale: 2, mode: "number" }).notNull(),
    failedCredits: smallint().notNull(),
    reasons: text().array().notNull(),
    status: warningStatusEnum().notNull().default("new"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("academic_warnings_student_id_term_id_unique").on(table.studentId, table.termId),
    index().on(table.termId, table.level),
    check("academic_warnings_level_range", sql`${table.level} BETWEEN 1 AND 3`),
    check("academic_warnings_has_reason", sql`cardinality(${table.reasons}) > 0`),
  ],
);

export const gradeAmendments = pgTable(
  "grade_amendments",
  {
    id: primaryId(),
    gradeSheetId: uuid()
      .notNull()
      .references(() => gradeSheets.id, { onDelete: "cascade" }),
    gradeComponentId: uuid()
      .notNull()
      .references(() => gradeComponents.id, { onDelete: "cascade" }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    componentLabel: text().notNull(),
    oldScore: numeric({ precision: 4, scale: 2, mode: "number" }),
    newScore: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
    reason: text().notNull(),
    source: gradeAmendmentSourceEnum().notNull(),
    requestId: uuid().references(() => academicRequests.id, { onDelete: "set null" }),
    status: gradeAmendmentStatusEnum().notNull().default("pending"),
    requestedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    requestedByName: text().notNull(),
    requestedAt: createdAt(),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decidedByName: text(),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    resultBefore: text(),
    resultAfter: text(),
  },
  (table) => [
    index().on(table.gradeSheetId, table.status),
    index().on(table.enrollmentId),
    index().on(table.studentId),
    index().on(table.gradeComponentId),
    index().on(table.status, table.requestedAt),
    index().on(table.requestedByUserId),
    index().on(table.decidedByUserId),
    uniqueIndex("grade_amendments_single_pending").on(table.enrollmentId, table.gradeComponentId).where(sql`${table.status} = 'pending'`),
    uniqueIndex("grade_amendments_request_unique").on(table.requestId).where(sql`${table.requestId} IS NOT NULL`),
    check("grade_amendments_score_range", sql`${table.newScore} BETWEEN 0 AND 10 AND (${table.oldScore} IS NULL OR ${table.oldScore} BETWEEN 0 AND 10)`),
    check("grade_amendments_changes_score", sql`${table.oldScore} IS DISTINCT FROM ${table.newScore}`),
    check("grade_amendments_reason_present", sql`length(btrim(${table.reason})) BETWEEN 1 AND 500`),
    check(
      "grade_amendments_decided_fields",
      sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL) AND (${table.decidedAt} IS NULL) = (${table.decidedByName} IS NULL) AND (${table.status} = 'approved') = (${table.resultAfter} IS NOT NULL)`,
    ),
    check("grade_amendments_reject_note", sql`${table.status} <> 'rejected' OR length(btrim(coalesce(${table.decisionNote}, ''))) > 0`),
    check("grade_amendments_not_self_approved", sql`${table.decidedByUserId} IS NULL OR ${table.requestedByUserId} IS NULL OR ${table.decidedByUserId} <> ${table.requestedByUserId}`),
  ],
);
