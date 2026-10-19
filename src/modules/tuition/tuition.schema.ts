import { sql } from "drizzle-orm";
import { check, date, index, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "../../shared/libs/db-column.lib";
import { terms } from "../course-registration/course-registration.schema";
import { students } from "../users/users.schema";

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
    ...timestamps(),
  },
  (table) => [unique().on(table.studentId, table.termId), index().on(table.termId, table.dueDate), check("tuition_invoices_discount_non_negative", sql`${table.discount} >= 0`)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: primaryId(),
    invoiceId: uuid()
      .notNull()
      .references(() => tuitionInvoices.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    label: text().notNull(),
    quantity: smallint().notNull(),
    unitPrice: money().notNull(),
    amount: money()
      .notNull()
      .generatedAlwaysAs(sql`quantity * unit_price`),
  },
  (table) => [
    unique().on(table.invoiceId, table.position),
    check("invoice_lines_quantity_positive", sql`${table.quantity} > 0`),
    check("invoice_lines_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
  ],
);

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
    reference: text().notNull().unique(),
  },
  (table) => [index().on(table.invoiceId, table.paidAt), check("payments_amount_positive", sql`${table.amount} > 0`)],
);
