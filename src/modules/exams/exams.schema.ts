import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { lecturers } from "@/modules/users/users.schema";

export const examKindEnum = pgEnum("exam_kind", ["midterm", "final"]);
export const examFormatEnum = pgEnum("exam_format", ["written", "multiple-choice", "practical", "oral", "project"]);
export const examSessionStatusEnum = pgEnum("exam_session_status", ["draft", "published", "done"]);
export const examPaperStatusEnum = pgEnum("exam_paper_status", ["not-submitted", "submitted", "approved"]);

export const examSessions = pgTable(
  "exam_sessions",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    kind: examKindEnum().notNull(),
    format: examFormatEnum().notNull(),
    date: date({ mode: "string" }).notNull(),
    startTime: time().notNull(),
    durationMinutes: smallint().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    status: examSessionStatusEnum().notNull().default("draft"),
    paperStatus: examPaperStatusEnum().notNull().default("not-submitted"),
    paperDeadline: timestamp({ withTimezone: true }).notNull(),
    // Đề thi và đáp án nộp cùng lúc, nội dung nằm trong kho tệp (storage.lib) dưới khóa do server sinh; nộp lại thì thay cả hai.
    paperStorageKey: text().unique("exam_sessions_paper_storage_key_unique"),
    paperFileName: text(),
    paperContentType: text(),
    paperSizeBytes: integer(),
    answerKeyStorageKey: text().unique("exam_sessions_answer_key_storage_key_unique"),
    answerKeyFileName: text(),
    answerKeyContentType: text(),
    answerKeySizeBytes: integer(),
    paperSubmittedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    unique("exam_sessions_class_section_id_kind_unique").on(table.classSectionId, table.kind),
    index().on(table.termId, table.date),
    index().on(table.roomId, table.date),
    check("exam_sessions_duration_range", sql`${table.durationMinutes} BETWEEN 15 AND 240`),
    check(
      "exam_sessions_paper_fields",
      sql`num_nonnulls(${table.paperStorageKey}, ${table.paperFileName}, ${table.paperContentType}, ${table.paperSizeBytes}, ${table.answerKeyStorageKey}, ${table.answerKeyFileName}, ${table.answerKeyContentType}, ${table.answerKeySizeBytes}, ${table.paperSubmittedAt}) = CASE WHEN ${table.paperStatus} = 'not-submitted' THEN 0 ELSE 9 END`,
    ),
    check("exam_sessions_paper_size_range", sql`${table.paperSizeBytes} BETWEEN 1 AND 20971520 AND ${table.answerKeySizeBytes} BETWEEN 1 AND 20971520`),
  ],
);

export const examProctors = pgTable(
  "exam_proctors",
  {
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    lecturerId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.examSessionId, table.lecturerId] }), index().on(table.lecturerId)],
);

export const examEligibilityOverrides = pgTable(
  "exam_eligibility_overrides",
  {
    id: primaryId(),
    enrollmentId: uuid()
      .notNull()
      .unique("exam_eligibility_overrides_enrollment_id_unique")
      .references(() => enrollments.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decidedAt: createdAt(),
  },
  (table) => [index().on(table.decidedByUserId)],
);

// Đề nghị đổi ca coi thi của giảng viên gửi Phòng Khảo thí. Người gửi phải đang được phân công coi ca đó (khóa ngoại kép
// tới exam_proctors); Phòng Khảo thí đổi phân công thì đề nghị cũ tự xóa theo.
export const examProctorSwapRequests = pgTable(
  "exam_proctor_swap_requests",
  {
    id: primaryId(),
    examSessionId: uuid().notNull(),
    requesterId: uuid().notNull(),
    substituteId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    reason: text().notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "exam_proctor_swap_requests_proctor_fk",
      columns: [table.examSessionId, table.requesterId],
      foreignColumns: [examProctors.examSessionId, examProctors.lecturerId],
    }).onDelete("cascade"),
    uniqueIndex("exam_proctor_swap_requests_single_pending").on(table.examSessionId, table.requesterId).where(sql`${table.resolvedAt} IS NULL`),
    index().on(table.requesterId),
    index().on(table.substituteId),
    check("exam_proctor_swap_requests_distinct_people", sql`${table.requesterId} <> ${table.substituteId}`),
    check("exam_proctor_swap_requests_reason_present", sql`length(btrim(${table.reason})) > 0`),
  ],
);
