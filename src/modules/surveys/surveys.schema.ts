import { sql } from "drizzle-orm";
import { check, date, index, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { classSections, terms } from "../course-registration/course-registration.schema";
import { students } from "../users/users.schema";

export const surveys = pgTable(
  "surveys",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    title: text().notNull(),
    opensAt: timestamp({ withTimezone: true }).notNull(),
    closesAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index().on(table.termId), check("surveys_time_order", sql`${table.opensAt} < ${table.closesAt}`)],
);

export const surveyQuestions = pgTable(
  "survey_questions",
  {
    id: primaryId(),
    surveyId: uuid()
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    group: text().notNull(),
    text: text().notNull(),
  },
  (table) => [unique("survey_questions_survey_id_position_unique").on(table.surveyId, table.position)],
);

export const surveySubmissions = pgTable(
  "survey_submissions",
  {
    surveyId: uuid()
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    submittedOn: date({ mode: "string" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.surveyId, table.classSectionId, table.studentId] }), index().on(table.classSectionId), index().on(table.studentId)],
);

export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: primaryId(),
    surveyId: uuid()
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    comment: text(),
  },
  (table) => [index().on(table.surveyId, table.classSectionId), index().on(table.classSectionId)],
);

export const surveyAnswers = pgTable(
  "survey_answers",
  {
    responseId: uuid()
      .notNull()
      .references(() => surveyResponses.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: "cascade" }),
    score: smallint().notNull(),
  },
  (table) => [primaryKey({ columns: [table.responseId, table.questionId] }), index().on(table.questionId), check("survey_answers_score_range", sql`${table.score} BETWEEN 1 AND 5`)],
);
