import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, terms } from "@/modules/course-registration/course-registration.schema";
import { students } from "@/modules/users/users.schema";

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
    // Lúc đã xáo lại phiếu sau khi đóng đợt (xem sealSurvey): từ đó giảng viên mới xem được kết quả.
    sealedAt: timestamp({ withTimezone: true }),
    // Lần nhắc sinh viên chưa làm gần nhất, để không nhắc dồn dập.
    remindedAt: timestamp({ withTimezone: true }),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    index().on(table.termId),
    index().on(table.createdByUserId),
    check("surveys_time_order", sql`${table.opensAt} < ${table.closesAt}`),
    check("surveys_title_present", sql`length(btrim(${table.title})) BETWEEN 1 AND 200`),
  ],
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
  (table) => [
    unique("survey_questions_survey_id_position_unique").on(table.surveyId, table.position),
    check("survey_questions_text_present", sql`length(btrim(${table.text})) BETWEEN 1 AND 300 AND length(btrim(${table.group})) BETWEEN 1 AND 100`),
  ],
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
  },
  (table) => [primaryKey({ columns: [table.surveyId, table.classSectionId, table.studentId] }), index().on(table.classSectionId), index().on(table.studentId)],
);

// Phiếu trả lời ẩn danh: id ngẫu nhiên (uuid v4, không mang thời điểm), không cột thời gian, không khóa tới sinh viên.
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
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
