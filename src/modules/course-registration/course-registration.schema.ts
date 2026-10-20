import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { courses, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { lecturers, students } from "@/modules/users/users.schema";

export const classSectionStatusEnum = pgEnum("class_section_status", ["draft", "open", "cancelled"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["enrolled", "dropped"]);
export const waitlistStatusEnum = pgEnum("waitlist_status", ["waiting", "promoted", "cancelled", "expired"]);
export const holdKindEnum = pgEnum("hold_kind", ["tuition", "discipline", "documents", "academic-status", "advisor"]);
export const registrationEventKindEnum = pgEnum("registration_event_kind", [
  "add",
  "drop",
  "swap",
  "waitlist",
  "waitlist-promoted",
  "admin-add",
  "admin-drop",
  "section-cancelled",
  "waitlist-expired",
]);

const DAY_OF_WEEK = (column: unknown) => sql`${column} BETWEEN 2 AND 8`;
const PERIOD_RANGE = (start: unknown, end: unknown) => sql`${start} >= 1 AND ${end} <= 12 AND ${start} <= ${end}`;

export const terms = pgTable(
  "terms",
  {
    id: primaryId(),
    code: text().notNull().unique("terms_code_unique"),
    name: text().notNull(),
    shortName: text().notNull(),
    academicYear: smallint().notNull(),
    semester: smallint().notNull(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    isCurrent: boolean().notNull().default(false),
    isRegistrationTarget: boolean().notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique("terms_academic_year_semester_unique").on(table.academicYear, table.semester),
    uniqueIndex("terms_single_current").on(table.isCurrent).where(sql`${table.isCurrent}`),
    uniqueIndex("terms_single_registration_target").on(table.isRegistrationTarget).where(sql`${table.isRegistrationTarget}`),
    check("terms_semester_range", sql`${table.semester} BETWEEN 1 AND 3`),
    check("terms_date_order", sql`${table.startDate} < ${table.endDate}`),
  ],
);

export const registrationPeriods = pgTable(
  "registration_periods",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    name: text().notNull(),
    cohorts: smallint().array().notNull(),
    opensAt: timestamp({ withTimezone: true }).notNull(),
    closesAt: timestamp({ withTimezone: true }).notNull(),
    // Hạn mức riêng của đợt, bỏ trống thì theo quy chế; đặt thì giới hạn thêm trên hạn mức quy chế.
    minCredits: smallint(),
    maxCredits: smallint(),
    ...timestamps(),
  },
  (table) => [
    index().on(table.termId),
    check("registration_periods_has_cohorts", sql`cardinality(${table.cohorts}) > 0`),
    check("registration_periods_time_order", sql`${table.opensAt} < ${table.closesAt}`),
    check(
      "registration_periods_credit_range",
      sql`(${table.minCredits} IS NULL OR ${table.minCredits} >= 0) AND (${table.maxCredits} IS NULL OR ${table.maxCredits} > 0) AND (${table.minCredits} IS NULL OR ${table.maxCredits} IS NULL OR ${table.minCredits} <= ${table.maxCredits})`,
    ),
  ],
);

export const classSections = pgTable(
  "class_sections",
  {
    id: primaryId(),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    sectionNumber: smallint().notNull(),
    code: text().notNull(),
    lecturerId: uuid().references(() => lecturers.id, { onDelete: "set null" }),
    capacity: smallint().notNull(),
    enrolledCount: smallint().notNull().default(0),
    minEnrollment: smallint().notNull().default(0),
    status: classSectionStatusEnum().notNull().default("draft"),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    audienceCohorts: smallint().array(),
    audienceNote: text(),
    ...timestamps(),
  },
  (table) => [
    unique("class_sections_term_id_course_id_section_number_unique").on(table.termId, table.courseId, table.sectionNumber),
    unique("class_sections_term_id_code_unique").on(table.termId, table.code),
    unique("class_sections_identity").on(table.id, table.termId, table.courseId),
    index().on(table.courseId),
    index().on(table.lecturerId),
    check("class_sections_capacity_positive", sql`${table.capacity} > 0`),
    check("class_sections_enrolled_within_capacity", sql`${table.enrolledCount} >= 0 AND ${table.enrolledCount} <= ${table.capacity}`),
    check("class_sections_min_enrollment_range", sql`${table.minEnrollment} >= 0 AND ${table.minEnrollment} <= ${table.capacity}`),
    check("class_sections_date_order", sql`${table.startDate} < ${table.endDate}`),
    // Lớp nháp, lớp đã hủy không còn sinh viên: hủy lớp phải rút hết sinh viên trước, lớp có sinh viên không về nháp được.
    check("class_sections_enrolled_only_when_open", sql`${table.status} = 'open' OR ${table.enrolledCount} = 0`),
  ],
);

export const classSectionAudienceMajors = pgTable(
  "class_section_audience_majors",
  {
    classSectionId: uuid().notNull(),
    majorId: uuid()
      .notNull()
      .references(() => majors.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.classSectionId, table.majorId] }),
    foreignKey({ name: "class_section_audience_majors_section_fk", columns: [table.classSectionId], foreignColumns: [classSections.id] }).onDelete("cascade"),
    index().on(table.majorId),
  ],
);

export const sectionMeetings = pgTable(
  "section_meetings",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    dayOfWeek: smallint().notNull(),
    startPeriod: smallint().notNull(),
    endPeriod: smallint().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
  },
  (table) => [
    index().on(table.classSectionId),
    index().on(table.roomId, table.dayOfWeek),
    check("section_meetings_day_of_week", DAY_OF_WEEK(table.dayOfWeek)),
    check("section_meetings_period_range", PERIOD_RANGE(table.startPeriod, table.endPeriod)),
  ],
);

export const labGroups = pgTable(
  "lab_groups",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    code: text().notNull(),
    dayOfWeek: smallint().notNull(),
    startPeriod: smallint().notNull(),
    endPeriod: smallint().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    capacity: smallint().notNull(),
    enrolledCount: smallint().notNull().default(0),
  },
  (table) => [
    unique("lab_groups_class_section_id_code_unique").on(table.classSectionId, table.code),
    unique("lab_groups_identity").on(table.id, table.classSectionId),
    index().on(table.roomId, table.dayOfWeek),
    check("lab_groups_day_of_week", DAY_OF_WEEK(table.dayOfWeek)),
    check("lab_groups_period_range", PERIOD_RANGE(table.startPeriod, table.endPeriod)),
    check("lab_groups_capacity_positive", sql`${table.capacity} > 0`),
    check("lab_groups_enrolled_within_capacity", sql`${table.enrolledCount} >= 0 AND ${table.enrolledCount} <= ${table.capacity}`),
  ],
);

export const reservedSeats = pgTable(
  "reserved_seats",
  {
    id: primaryId(),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    label: text().notNull(),
    seats: smallint().notNull(),
    takenCount: smallint().notNull().default(0),
    cohorts: smallint().array().notNull().default(sql`'{}'::smallint[]`),
  },
  (table) => [
    index().on(table.classSectionId),
    unique("reserved_seats_identity").on(table.id, table.classSectionId),
    check("reserved_seats_seats_positive", sql`${table.seats} > 0`),
    check("reserved_seats_taken_within_seats", sql`${table.takenCount} >= 0 AND ${table.takenCount} <= ${table.seats}`),
  ],
);

export const reservedSeatMajors = pgTable(
  "reserved_seat_majors",
  {
    reservedSeatId: uuid()
      .notNull()
      .references(() => reservedSeats.id, { onDelete: "cascade" }),
    majorId: uuid()
      .notNull()
      .references(() => majors.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.reservedSeatId, table.majorId] }), index().on(table.majorId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    classSectionId: uuid().notNull(),
    termId: uuid().notNull(),
    courseId: uuid().notNull(),
    labGroupId: uuid(),
    reservedSeatId: uuid(),
    status: enrollmentStatusEnum().notNull().default("enrolled"),
    registeredAt: createdAt(),
    droppedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "enrollments_class_section_fk",
      columns: [table.classSectionId, table.termId, table.courseId],
      foreignColumns: [classSections.id, classSections.termId, classSections.courseId],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_lab_group_fk",
      columns: [table.labGroupId, table.classSectionId],
      foreignColumns: [labGroups.id, labGroups.classSectionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_reserved_seat_fk",
      columns: [table.reservedSeatId, table.classSectionId],
      foreignColumns: [reservedSeats.id, reservedSeats.classSectionId],
    }).onDelete("restrict"),
    unique("enrollments_identity").on(table.id, table.studentId, table.courseId, table.termId),
    index().on(table.reservedSeatId),
    uniqueIndex("enrollments_active_per_section").on(table.studentId, table.classSectionId).where(sql`${table.status} = 'enrolled'`),
    uniqueIndex("enrollments_active_per_course_term").on(table.studentId, table.termId, table.courseId).where(sql`${table.status} = 'enrolled'`),
    index().on(table.classSectionId, table.status),
    index().on(table.studentId, table.termId),
    index().on(table.labGroupId),
    check("enrollments_dropped_at_matches_status", sql`(${table.status} = 'dropped') = (${table.droppedAt} IS NOT NULL)`),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    status: waitlistStatusEnum().notNull().default("waiting"),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("waitlist_entries_single_waiting").on(table.studentId, table.classSectionId).where(sql`${table.status} = 'waiting'`),
    index("waitlist_entries_queue").on(table.classSectionId, table.createdAt).where(sql`${table.status} = 'waiting'`),
    check("waitlist_entries_resolved_at_matches_status", sql`(${table.status} = 'waiting') = (${table.resolvedAt} IS NULL)`),
  ],
);

export const registrationHolds = pgTable(
  "registration_holds",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    kind: holdKindEnum().notNull(),
    blocking: boolean().notNull(),
    reason: text().notNull(),
    resolveHint: text().notNull(),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    createdByLabel: text().notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    releasedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    releasedByLabel: text(),
  },
  (table) => [
    uniqueIndex("registration_holds_single_active").on(table.studentId, table.kind).where(sql`${table.releasedAt} IS NULL`),
    index().on(table.createdByUserId),
    index().on(table.releasedByUserId),
    check("registration_holds_release_fields", sql`(${table.releasedAt} IS NULL) = (${table.releasedByLabel} IS NULL)`),
    check("registration_holds_release_after_create", sql`${table.releasedAt} IS NULL OR ${table.releasedAt} >= ${table.createdAt}`),
  ],
);

export const registrationEvents = pgTable(
  "registration_events",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classSectionId: uuid()
      .notNull()
      .references(() => classSections.id, { onDelete: "cascade" }),
    kind: registrationEventKindEnum().notNull(),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    actorLabel: text().notNull(),
    channel: text().notNull(),
    note: text().notNull().default(""),
    at: createdAt(),
  },
  (table) => [index().on(table.studentId, table.at), index().on(table.at), index().on(table.classSectionId), index().on(table.actorUserId)],
);
