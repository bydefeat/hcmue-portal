import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { studentDecisions, students } from "@/modules/users/users.schema";

export const graduationRecordStatusEnum = pgEnum("graduation_record_status", ["pending", "approved", "graduated"]);

// Đợt xét tốt nghiệp: Phòng Đào tạo cấu hình các khóa được xét. Mỗi lúc chỉ một đợt mở; trang xét tốt nghiệp, báo cáo xếp loại
// (bỏ khóa đang xét) đọc khóa từ đợt đang mở.
export const graduationRounds = pgTable(
  "graduation_rounds",
  {
    id: primaryId(),
    name: text().notNull(),
    cohorts: smallint().array().notNull(),
    isOpen: boolean().notNull().default(true),
    createdByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("graduation_rounds_single_open").on(table.isOpen).where(sql`${table.isOpen}`),
    index().on(table.createdByUserId),
    check("graduation_rounds_has_cohort", sql`cardinality(${table.cohorts}) > 0`),
  ],
);

export const graduationRecords = pgTable(
  "graduation_records",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .unique("graduation_records_student_id_unique")
      .references(() => students.id, { onDelete: "cascade" }),
    languageCertificate: text(),
    // Bậc ngoại ngữ (khung tham chiếu châu Âu) Phòng Đào tạo xác nhận theo chứng chỉ, so với chuẩn tối thiểu của quy chế.
    languageLevel: text(),
    itCertificate: text(),
    certificatesVerifiedAt: timestamp({ withTimezone: true }),
    certificatesVerifiedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    // Không còn dùng để xét: học phí suy ra từ hóa đơn học phí, kỷ luật từ quyết định kỷ luật đã ký (graduation.query).
    tuitionCleared: boolean().notNull().default(false),
    disciplineFree: boolean().notNull().default(true),
    status: graduationRecordStatusEnum().notNull().default("pending"),
    decidedAt: timestamp({ withTimezone: true }),
    decidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    roundId: uuid().references(() => graduationRounds.id, { onDelete: "set null" }),
    decisionId: uuid()
      .unique("graduation_records_decision_id_unique")
      .references(() => studentDecisions.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    check("graduation_records_decided_fields", sql`(${table.status} = 'pending') = (${table.decidedAt} IS NULL)`),
    check("graduation_records_language_level", sql`${table.languageLevel} IS NULL OR ${table.languageLevel} IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')`),
    index().on(table.roundId),
    index().on(table.certificatesVerifiedByUserId),
  ],
);
