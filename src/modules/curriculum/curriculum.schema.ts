import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgEnum, pgTable, primaryKey, smallint, text, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";

export const courseTypeEnum = pgEnum("course_type", ["required", "elective"]);
export const knowledgeBlockEnum = pgEnum("knowledge_block", ["general", "foundation", "major", "internship"]);
export const courseRelationKindEnum = pgEnum("course_relation_kind", ["prerequisite", "corequisite", "equivalent"]);
export const programStatusEnum = pgEnum("program_status", ["active", "draft", "archived"]);

export const faculties = pgTable("faculties", {
  id: primaryId(),
  code: text().notNull().unique("faculties_code_unique"),
  name: text().notNull().unique("faculties_name_unique"),
  ...timestamps(),
});

export const majors = pgTable(
  "majors",
  {
    id: primaryId(),
    code: text().notNull().unique("majors_code_unique"),
    name: text().notNull(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (table) => [index().on(table.facultyId)],
);

export const courses = pgTable(
  "courses",
  {
    id: primaryId(),
    code: text().notNull().unique("courses_code_unique"),
    name: text().notNull(),
    credits: smallint().notNull(),
    theoryCredits: smallint().notNull(),
    practiceCredits: smallint().notNull(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: "restrict" }),
    type: courseTypeEnum().notNull(),
    block: knowledgeBlockEnum().notNull(),
    isActive: boolean().notNull().default(true),
    isConditional: boolean().notNull().default(false),
    description: text().notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index().on(table.facultyId),
    check("courses_credits_positive", sql`${table.credits} > 0`),
    check("courses_credit_split", sql`${table.theoryCredits} >= 0 AND ${table.practiceCredits} >= 0 AND ${table.theoryCredits} + ${table.practiceCredits} = ${table.credits}`),
  ],
);

export const courseRelations = pgTable(
  "course_relations",
  {
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    relatedCourseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    kind: courseRelationKindEnum().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.kind, table.relatedCourseId] }),
    index().on(table.relatedCourseId),
    check("course_relations_not_self", sql`${table.courseId} <> ${table.relatedCourseId}`),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: primaryId(),
    code: text().notNull(),
    name: text().notNull(),
    majorId: uuid()
      .notNull()
      .references(() => majors.id, { onDelete: "restrict" }),
    degree: text().notNull(),
    totalCredits: smallint().notNull(),
    durationYears: smallint().notNull(),
    status: programStatusEnum().notNull().default("draft"),
    ...timestamps(),
  },
  (table) => [
    index().on(table.majorId),
    check("programs_total_credits_positive", sql`${table.totalCredits} > 0`),
    check("programs_duration_range", sql`${table.durationYears} BETWEEN 1 AND 8`),
  ],
);

export const programCohorts = pgTable(
  "program_cohorts",
  {
    programId: uuid()
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    cohort: smallint().notNull(),
  },
  (table) => [primaryKey({ columns: [table.programId, table.cohort] }), index().on(table.cohort)],
);

export const programElectiveGroups = pgTable(
  "program_elective_groups",
  {
    id: primaryId(),
    programId: uuid()
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    minCredits: smallint().notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("program_elective_groups_program_id_name_unique").on(table.programId, table.name),
    unique("program_elective_groups_identity").on(table.id, table.programId),
    check("program_elective_groups_min_credits_range", sql`${table.minCredits} BETWEEN 1 AND 60`),
    check("program_elective_groups_name_present", sql`length(btrim(${table.name})) BETWEEN 1 AND 120`),
  ],
);

export const programCourses = pgTable(
  "program_courses",
  {
    programId: uuid()
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    semester: smallint().notNull(),
    electiveGroupId: uuid(),
  },
  (table) => [
    primaryKey({ columns: [table.programId, table.courseId] }),
    index().on(table.courseId),
    index().on(table.electiveGroupId),
    foreignKey({
      name: "program_courses_elective_group_fk",
      columns: [table.electiveGroupId, table.programId],
      foreignColumns: [programElectiveGroups.id, programElectiveGroups.programId],
    }),
    check("program_courses_semester_range", sql`${table.semester} BETWEEN 1 AND 12`),
  ],
);
