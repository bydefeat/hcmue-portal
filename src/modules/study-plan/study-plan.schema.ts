import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { courses } from "../curriculum/curriculum.schema";
import { lecturers, students } from "../users/users.schema";

export const studyPlanStatusEnum = pgEnum("study_plan_status", ["draft", "pending", "approved", "returned"]);

export const studyPlans = pgTable(
  "study_plans",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: studyPlanStatusEnum().notNull().default("draft"),
    isActive: boolean().notNull().default(true),
    studentNote: text().notNull().default(""),
    advisorComment: text(),
    submittedAt: timestamp({ withTimezone: true }),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedById: uuid().references(() => lecturers.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("study_plans_single_active").on(table.studentId).where(sql`${table.isActive}`),
    index().on(table.status),
    index().on(table.reviewedById),
    check("study_plans_submitted_fields", sql`${table.status} = 'draft' OR ${table.submittedAt} IS NOT NULL`),
    check("study_plans_reviewed_fields", sql`(${table.status} IN ('approved', 'returned')) = (${table.reviewedAt} IS NOT NULL)`),
    check("study_plans_return_comment", sql`${table.status} <> 'returned' OR ${table.advisorComment} IS NOT NULL`),
  ],
);

export const studyPlanItems = pgTable(
  "study_plan_items",
  {
    studyPlanId: uuid()
      .notNull()
      .references(() => studyPlans.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    academicYear: smallint().notNull(),
    semester: smallint().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.studyPlanId, table.courseId] }),
    index().on(table.courseId),
    check("study_plan_items_semester_range", sql`${table.semester} BETWEEN 1 AND 3`),
  ],
);
