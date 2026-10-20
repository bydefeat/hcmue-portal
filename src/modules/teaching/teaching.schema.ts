import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { classSections } from "@/modules/course-registration/course-registration.schema";
import { lecturers, students } from "@/modules/users/users.schema";

export const syllabusStatusEnum = pgEnum("syllabus_status", ["draft", "published"]);
export const classAnnouncementStatusEnum = pgEnum("class_announcement_status", ["published", "scheduled"]);

export const syllabi = pgTable(
  "syllabi",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .unique("syllabi_class_section_id_unique")
      .references(() => classSections.id, { onDelete: "cascade" }),
    status: syllabusStatusEnum().notNull().default("draft"),
    description: text().notNull().default(""),
    references: text().array().notNull().default(sql`'{}'::text[]`),
    publishedAt: timestamp({ withTimezone: true }),
    // Phiên bản cách tính điểm: đề cương đã công bố mà đổi đánh giá thì tăng phiên bản, bản cũ lưu ở syllabus_revisions.
    version: smallint().notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    check("syllabi_published_fields", sql`(${table.status} = 'published') = (${table.publishedAt} IS NOT NULL)`),
    check("syllabi_version_positive", sql`${table.version} >= 1`),
  ],
);

// Bản cách tính điểm cũ của đề cương đã công bố (trước mỗi lần đổi), kèm lý do đổi.
export const syllabusRevisions = pgTable(
  "syllabus_revisions",
  {
    id: primaryId(),
    syllabusId: uuid()
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    version: smallint().notNull(),
    assessments: jsonb().$type<{ key: string; label: string; weight: number }[]>().notNull(),
    note: text().notNull(),
    revisedAt: createdAt(),
  },
  (table) => [
    unique("syllabus_revisions_syllabus_id_version_unique").on(table.syllabusId, table.version),
    check("syllabus_revisions_note_present", sql`length(btrim(${table.note})) BETWEEN 1 AND 300`),
  ],
);

export const syllabusOutcomes = pgTable(
  "syllabus_outcomes",
  {
    id: primaryId(),
    syllabusId: uuid()
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    code: text().notNull(),
    text: text().notNull(),
    position: smallint().notNull(),
  },
  (table) => [unique("syllabus_outcomes_syllabus_id_code_unique").on(table.syllabusId, table.code), unique("syllabus_outcomes_syllabus_id_position_unique").on(table.syllabusId, table.position)],
);

export const syllabusWeeks = pgTable(
  "syllabus_weeks",
  {
    syllabusId: uuid()
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    week: smallint().notNull(),
    topic: text().notNull(),
    activities: text().notNull().default(""),
    readings: text().notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.syllabusId, table.week] }), check("syllabus_weeks_week_range", sql`${table.week} BETWEEN 1 AND 20`)],
);

export const syllabusAssessments = pgTable(
  "syllabus_assessments",
  {
    id: primaryId(),
    syllabusId: uuid()
      .notNull()
      .references(() => syllabi.id, { onDelete: "cascade" }),
    key: text().notNull(),
    label: text().notNull(),
    weight: smallint().notNull(),
    method: text().notNull(),
    outcomeCodes: text().array().notNull().default(sql`'{}'::text[]`),
    position: smallint().notNull(),
  },
  (table) => [
    unique("syllabus_assessments_syllabus_id_key_unique").on(table.syllabusId, table.key),
    unique("syllabus_assessments_syllabus_id_position_unique").on(table.syllabusId, table.position),
    check("syllabus_assessments_weight_range", sql`${table.weight} BETWEEN 1 AND 100`),
  ],
);

export const classAnnouncements = pgTable(
  "class_announcements",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    title: text().notNull(),
    body: text().notNull(),
    isPinned: boolean().notNull().default(false),
    sendEmail: boolean().notNull().default(false),
    status: classAnnouncementStatusEnum().notNull().default("published"),
    publishAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Lúc đã báo sinh viên (chuông + email nếu bật). Trống là chưa báo: bài hẹn giờ chờ tác vụ class-announcements.
    notifiedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index().on(table.classSectionId, table.publishAt),
    index().on(table.authorId),
    index("class_announcements_pending_idx").on(table.publishAt).where(sql`${table.notifiedAt} IS NULL`),
    check("class_announcements_notified_published", sql`${table.notifiedAt} IS NULL OR ${table.status} = 'published'`),
  ],
);

export const classAnnouncementReads = pgTable(
  "class_announcement_reads",
  {
    classAnnouncementId: uuid().notNull(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    readAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.classAnnouncementId, table.studentId] }),
    foreignKey({ name: "class_announcement_reads_announcement_fk", columns: [table.classAnnouncementId], foreignColumns: [classAnnouncements.id] }).onDelete("cascade"),
    index().on(table.studentId),
  ],
);
