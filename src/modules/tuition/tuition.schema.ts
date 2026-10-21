import { sql } from "drizzle-orm";
import { boolean, check, date, index, numeric, pgEnum, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, primaryId, timestamps } from "@/shared/libs/db-column.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { majors } from "@/modules/curriculum/curriculum.schema";
import { students } from "@/modules/users/users.schema";

const money = () => numeric({ precision: 14, scale: 0, mode: "number" });

export const tuitionInvoices = pgTable(
  "tuition_invoices",
  {
    id: primaryId(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    termId: uuid()
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    dueDate: date({ mode: "string" }).notNull(),
    discount: money().notNull().default(0),
    discountReason: text().notNull().default(""),
    finalizedAt: timestamp({ withTimezone: true }),
    finalizedByLabel: text(),
    ...timestamps(),
  },
  (table) => [
    unique("tuition_invoices_student_id_term_id_unique").on(table.studentId, table.termId),
    index().on(table.termId, table.dueDate),
    check("tuition_invoices_discount_non_negative", sql`${table.discount} >= 0`),
    check("tuition_invoices_discount_reason", sql`${table.discount} = 0 OR btrim(${table.discountReason}) <> ''`),
    check("tuition_invoices_finalized_fields", sql`(${table.finalizedAt} IS NULL) = (${table.finalizedByLabel} IS NULL)`),
  ],
);

export const invoiceLineKindEnum = pgEnum("invoice_line_kind", ["tuition", "fee", "adjustment"]);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: primaryId(),
    invoiceId: uuid()
      .notNull()
      .references(() => tuitionInvoices.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    kind: invoiceLineKindEnum().notNull().default("tuition"),
    label: text().notNull(),
    quantity: smallint().notNull(),
    unitPrice: money().notNull(),
    amount: money()
      .notNull()
      .generatedAlwaysAs(sql`quantity * unit_price`),
  },
  (table) => [
    unique("invoice_lines_invoice_id_position_unique").on(table.invoiceId, table.position),
    check("invoice_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("invoice_lines_unit_price_non_negative", sql`${table.unitPrice} >= 0 OR ${table.kind} = 'adjustment'`),
  ],
);

export const paymentSourceEnum = pgEnum("payment_source", ["bank-sync", "statement", "manual"]);

export const payments = pgTable(
  "payments",
  {
    id: primaryId(),
    invoiceId: uuid()
      .notNull()
      .references(() => tuitionInvoices.id, { onDelete: "restrict" }),
    paidAt: timestamp({ withTimezone: true }).notNull(),
    amount: money().notNull(),
    method: text().notNull(),
    reference: text().notNull(),
    source: paymentSourceEnum().notNull(),
    note: text().notNull().default(""),
    createdAt: createdAt(),
    recordedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    recordedByLabel: text().notNull(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    voidedByLabel: text(),
    voidReason: text(),
  },
  (table) => [
    index().on(table.invoiceId, table.paidAt),
    index().on(table.recordedByUserId),
    index().on(table.voidedByUserId),
    uniqueIndex("payments_reference_unique").on(table.reference).where(sql`${table.voidedAt} IS NULL`),
    check("payments_amount_positive", sql`${table.amount} > 0`),
    check("payments_reference_not_blank", sql`btrim(${table.reference}) <> ''`),
    check("payments_void_fields", sql`(${table.voidedAt} IS NULL) = (${table.voidReason} IS NULL) AND (${table.voidedAt} IS NULL) = (${table.voidedByLabel} IS NULL)`),
  ],
);

export const tuitionRates = pgTable(
  "tuition_rates",
  {
    id: primaryId(),
    academicYear: smallint().notNull(),
    majorId: uuid()
      .notNull()
      .references(() => majors.id, { onDelete: "restrict" }),
    pricePerCredit: money().notNull(),
    note: text().notNull().default(""),
    ...timestamps(),
  },
  (table) => [unique("tuition_rates_academic_year_major_id_unique").on(table.academicYear, table.majorId), index().on(table.majorId), check("tuition_rates_price_non_negative", sql`${table.pricePerCredit} >= 0`)],
);

export const tuitionFees = pgTable(
  "tuition_fees",
  {
    id: primaryId(),
    academicYear: smallint().notNull(),
    code: text().notNull(),
    label: text().notNull(),
    amount: money().notNull(),
    isMandatory: boolean().notNull().default(true),
    ...timestamps(),
  },
  (table) => [unique("tuition_fees_academic_year_code_unique").on(table.academicYear, table.code), check("tuition_fees_amount_non_negative", sql`${table.amount} >= 0`)],
);

export const tuitionRefunds = pgTable(
  "tuition_refunds",
  {
    id: primaryId(),
    invoiceId: uuid()
      .notNull()
      .references(() => tuitionInvoices.id, { onDelete: "restrict" }),
    amount: money().notNull(),
    refundedAt: timestamp({ withTimezone: true }).notNull(),
    method: text().notNull(),
    reference: text().notNull(),
    note: text().notNull().default(""),
    createdAt: createdAt(),
    recordedByUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    recordedByLabel: text().notNull(),
  },
  (table) => [
    index().on(table.invoiceId),
    index().on(table.recordedByUserId),
    check("tuition_refunds_amount_positive", sql`${table.amount} > 0`),
    check("tuition_refunds_reference_not_blank", sql`btrim(${table.reference}) <> ''`),
  ],
);
