import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    // Chỉ bước "giảng viên" (chấm phúc khảo, xác nhận hoãn thi) gán đích danh giảng viên dạy lớp. Bước cố vấn suy ra từ
    // cố vấn hiện tại của lớp sinh hoạt; bước của khoa, phòng giao cho đơn vị theo vai trò quản trị.
    assigneeLecturerId: uuid().references(() => lecturers.id, { onDelete: "restrict" }),
    status: stepStatusEnum().notNull().default("waiting"),
    dueAt: timestamp({ withTimezone: true }),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    // Tên người xử lý lúc duyệt, giữ lại kể cả khi tài khoản đổi tên hoặc bị xóa.
    actorName: text(),
    actedAt: timestamp({ withTimezone: true }),
    comment: text(),
  },
  (table) => [
    unique("request_steps_request_id_position_unique").on(table.requestId, table.position),
    index().on(table.assigneeLecturerId, table.status),
    index().on(table.actorUserId),
    uniqueIndex("request_steps_one_pending").on(table.requestId).where(sql`${table.status} = 'pending'`),
    check("request_steps_position_positive", sql`${table.position} >= 1`),
    check("request_steps_acted_fields", sql`(${table.status} IN ('approved', 'rejected')) = (${table.actedAt} IS NOT NULL)`),
    check("request_steps_actor_name", sql`(${table.actedAt} IS NULL) = (${table.actorName} IS NULL)`),
    check("request_steps_reject_comment", sql`${table.status} <> 'rejected' OR ${table.comment} IS NOT NULL`),
    check("request_steps_pending_due", sql`${table.status} <> 'pending' OR ${table.dueAt} IS NOT NULL`),
    check("request_steps_lecturer_assignee", sql`(${table.role} = 'lecturer') = (${table.assigneeLecturerId} IS NOT NULL)`),
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
    // Tên tệp gốc chỉ để hiện và đặt tên khi tải xuống; nội dung nằm trong kho tệp (storage.lib) dưới khóa do server sinh.
    storageKey: text().notNull().unique("request_attachments_storage_key_unique"),
    uploadedAt: createdAt(),
  },
  (table) => [index().on(table.requestId), check("request_attachments_size_range", sql`${table.sizeBytes} BETWEEN 1 AND 10485760`)],
);

// Bộ đếm mã đơn theo tiền tố và năm (DT-2026-01255). Tăng bằng INSERT ... ON CONFLICT DO UPDATE trong giao dịch tạo đơn:
// dòng đếm bị khóa tới khi giao dịch xong nên hai người gửi cùng lúc không trùng số, giao dịch hỏng thì số không bị nhảy.
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
