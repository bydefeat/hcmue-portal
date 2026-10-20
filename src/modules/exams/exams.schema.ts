import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, integer, pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { academicRequests } from "@/modules/requests/requests.schema";
import { lecturers } from "@/modules/users/users.schema";

// makeup: ca thi bù cho sinh viên được hoãn thi (hoặc vắng thi có lý do) của một ca giữa kỳ, cuối kỳ.
export const examKindEnum = pgEnum("exam_kind", ["midterm", "final", "makeup"]);
export const examFormatEnum = pgEnum("exam_format", ["written", "multiple-choice", "practical", "oral", "project"]);
export const examSessionStatusEnum = pgEnum("exam_session_status", ["draft", "published", "done"]);
// returned: Phòng Khảo thí trả lại đề kèm lý do, giảng viên nộp lại; approved: đề bị khóa, không đổi tệp được nữa.
export const examSwapDecisionEnum = pgEnum("exam_swap_decision", ["accepted", "rejected", "withdrawn"]);
export const examPaperStatusEnum = pgEnum("exam_paper_status", ["not-submitted", "submitted", "approved", "returned"]);

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
    // Ca thi bù trỏ về ca gốc (giữa kỳ, cuối kỳ của cùng lớp); ca thường để trống.
    makeupOfId: uuid(),
    format: examFormatEnum().notNull(),
    date: date({ mode: "string" }).notNull(),
    startTime: time().notNull(),
    durationMinutes: smallint().notNull(),
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
    // Lần duyệt hoặc trả lại gần nhất; nộp lại thì xóa (lịch sử ở nhật ký thao tác).
    paperReviewedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    paperReviewedAt: timestamp({ withTimezone: true }),
    paperReturnReason: text(),
    ...timestamps(),
  },
  (table) => [
    // Mỗi lớp một ca giữa kỳ, một ca cuối kỳ; ca thi bù thì nhiều ca được.
    uniqueIndex("exam_sessions_class_section_id_kind_unique").on(table.classSectionId, table.kind).where(sql`${table.kind} IN ('midterm', 'final')`),
    unique("exam_sessions_id_class_section_id_unique").on(table.id, table.classSectionId),
    foreignKey({
      name: "exam_sessions_makeup_of_fk",
      columns: [table.makeupOfId, table.classSectionId],
      foreignColumns: [table.id, table.classSectionId],
    }).onDelete("cascade"),
    check("exam_sessions_makeup_of", sql`(${table.kind}::text = 'makeup') = (${table.makeupOfId} IS NOT NULL)`),
    // Hạn nộp đề phải trước giờ thi (giờ thi là giờ Việt Nam).
    check("exam_sessions_paper_deadline_before_exam", sql`${table.paperDeadline} < ((${table.date} + ${table.startTime}) AT TIME ZONE 'Asia/Ho_Chi_Minh')`),
    index().on(table.termId, table.date),
    check("exam_sessions_duration_range", sql`${table.durationMinutes} BETWEEN 15 AND 240`),
    check(
      "exam_sessions_paper_fields",
      sql`num_nonnulls(${table.paperStorageKey}, ${table.paperFileName}, ${table.paperContentType}, ${table.paperSizeBytes}, ${table.answerKeyStorageKey}, ${table.answerKeyFileName}, ${table.answerKeyContentType}, ${table.answerKeySizeBytes}, ${table.paperSubmittedAt}) = CASE WHEN ${table.paperStatus} = 'not-submitted' THEN 0 ELSE 9 END`,
    ),
    // So sánh dạng text: giá trị enum mới thêm (returned) chưa dùng được trong cùng giao dịch migration. Đề duyệt trước khi
    // có cột người duyệt (dữ liệu cũ) được phép thiếu thời điểm duyệt.
    check(
      "exam_sessions_paper_review_fields",
      sql`(${table.paperStatus}::text IN ('approved', 'returned') OR (${table.paperReviewedAt} IS NULL AND ${table.paperReviewedByUserId} IS NULL)) AND (${table.paperStatus}::text <> 'returned' OR ${table.paperReviewedAt} IS NOT NULL) AND (${table.paperReviewedByUserId} IS NULL OR ${table.paperReviewedAt} IS NOT NULL)`,
    ),
    check(
      "exam_sessions_paper_return_reason",
      sql`(${table.paperStatus}::text = 'returned') = (${table.paperReturnReason} IS NOT NULL) AND (${table.paperReturnReason} IS NULL OR length(btrim(${table.paperReturnReason})) BETWEEN 1 AND 500)`,
    ),
    index().on(table.paperReviewedByUserId),
    check("exam_sessions_paper_size_range", sql`${table.paperSizeBytes} BETWEEN 1 AND 20971520 AND ${table.answerKeySizeBytes} BETWEEN 1 AND 20971520`),
  ],
);

// Phòng thi của một ca: một ca có thể chia nhiều phòng theo sức chứa thi.
export const examSessionRooms = pgTable(
  "exam_session_rooms",
  {
    id: primaryId(),
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    position: smallint().notNull(),
  },
  (table) => [
    unique("exam_session_rooms_exam_session_id_room_id_unique").on(table.examSessionId, table.roomId),
    unique("exam_session_rooms_exam_session_id_position_unique").on(table.examSessionId, table.position),
    unique("exam_session_rooms_id_exam_session_id_unique").on(table.id, table.examSessionId),
    index().on(table.roomId),
  ],
);

// Cán bộ coi thi theo phòng: mỗi người coi một phòng của ca (khóa ngoại kép để phòng thuộc đúng ca).
export const examProctors = pgTable(
  "exam_proctors",
  {
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    lecturerId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    examRoomId: uuid().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.examSessionId, table.lecturerId] }),
    foreignKey({ name: "exam_proctors_room_fk", columns: [table.examRoomId, table.examSessionId], foreignColumns: [examSessionRooms.id, examSessionRooms.examSessionId] }).onDelete("cascade"),
    index().on(table.lecturerId),
    index().on(table.examRoomId),
  ],
);

// Thí sinh của ca thi: phòng và số báo danh (đánh lại khi Phòng Khảo thí đổi phòng hoặc công bố). Ca giữa kỳ, cuối kỳ là sinh
// viên đang học lớp trừ người được hoãn; ca thi bù là danh sách Phòng Khảo thí chọn.
export const examCandidates = pgTable(
  "exam_candidates",
  {
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    examRoomId: uuid().notNull(),
    candidateNumber: smallint().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.examSessionId, table.enrollmentId] }),
    unique("exam_candidates_exam_session_id_candidate_number_unique").on(table.examSessionId, table.candidateNumber),
    foreignKey({ name: "exam_candidates_room_fk", columns: [table.examRoomId, table.examSessionId], foreignColumns: [examSessionRooms.id, examSessionRooms.examSessionId] }).onDelete("cascade"),
    index().on(table.enrollmentId),
    index().on(table.examRoomId),
    check("exam_candidates_number_positive", sql`${table.candidateNumber} > 0`),
  ],
);

// Sinh viên được hoãn thi một kỳ thi (giữa kỳ hoặc cuối kỳ) của lớp: không có trong danh sách thi của ca đó, chờ thi bù.
// requestId: đơn hoãn thi đã duyệt sinh ra dòng này; Phòng Khảo thí ghi trực tiếp thì để trống. Công bố bảng điểm thì sinh viên
// đang được hoãn thi (chưa đủ điểm) nhận điểm I.
export const examDeferrals = pgTable(
  "exam_deferrals",
  {
    id: primaryId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    kind: examKindEnum().notNull(),
    reason: text().notNull(),
    requestId: uuid().references(() => academicRequests.id, { onDelete: "set null" }),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decidedAt: createdAt(),
  },
  (table) => [
    unique("exam_deferrals_enrollment_id_kind_unique").on(table.enrollmentId, table.kind),
    uniqueIndex("exam_deferrals_request_unique").on(table.requestId).where(sql`${table.requestId} IS NOT NULL`),
    index().on(table.decidedByUserId),
    check("exam_deferrals_kind", sql`${table.kind}::text <> 'makeup'`),
    check("exam_deferrals_reason_present", sql`length(btrim(${table.reason})) BETWEEN 1 AND 300`),
  ],
);

export const examEligibilityOverrides = pgTable(
  "exam_eligibility_overrides",
  {
    id: primaryId(),
    enrollmentId: uuid()
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    decidedAt: createdAt(),
    // Thu hồi (phát hiện minh chứng không hợp lệ): giữ dòng làm lịch sử, mỗi đăng ký chỉ một quyết định còn hiệu lực.
    revokedAt: timestamp({ withTimezone: true }),
    revokedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    revokeReason: text(),
  },
  (table) => [
    uniqueIndex("exam_eligibility_overrides_enrollment_id_unique").on(table.enrollmentId).where(sql`${table.revokedAt} IS NULL`),
    index().on(table.decidedByUserId),
    index().on(table.revokedByUserId),
    check("exam_eligibility_overrides_revoke_fields", sql`(${table.revokedAt} IS NULL) = (${table.revokeReason} IS NULL) AND (${table.revokedByUserId} IS NULL OR ${table.revokedAt} IS NOT NULL)`),
  ],
);

// Đề nghị đổi ca coi thi của giảng viên gửi Phòng Khảo thí. Lúc gửi người gửi phải đang coi ca đó (trigger
// exam_proctor_swap_requests_proctor_fk); đề nghị được giữ làm lịch sử kể cả khi người gửi đã được gỡ khỏi ca.
export const examProctorSwapRequests = pgTable(
  "exam_proctor_swap_requests",
  {
    id: primaryId(),
    examSessionId: uuid()
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    requesterId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    substituteId: uuid()
      .notNull()
      .references(() => lecturers.id, { onDelete: "restrict" }),
    reason: text().notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
    decision: examSwapDecisionEnum(),
    resolvedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    resolveNote: text(),
  },
  (table) => [
    check("exam_proctor_swap_requests_resolved_fields", sql`(${table.resolvedAt} IS NULL) = (${table.decision} IS NULL)`),
    index().on(table.resolvedByUserId),
    uniqueIndex("exam_proctor_swap_requests_single_pending").on(table.examSessionId, table.requesterId).where(sql`${table.resolvedAt} IS NULL`),
    index().on(table.requesterId),
    index().on(table.substituteId),
    check("exam_proctor_swap_requests_distinct_people", sql`${table.requesterId} <> ${table.substituteId}`),
    check("exam_proctor_swap_requests_reason_present", sql`length(btrim(${table.reason})) > 0`),
  ],
);
