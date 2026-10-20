import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { dayjs } from "@/shared/libs/date.lib";
import type { db, Transaction } from "@/shared/libs/db.lib";
import { classSections, enrollments, registrationHolds, terms } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { adjustmentLine, billedCredits, buildInvoiceLines, finalizedPricePerCredit } from "@/modules/tuition/tuition.rule";
import { invoiceLines, payments, tuitionFees, tuitionInvoices, tuitionRates, tuitionRefunds } from "@/modules/tuition/tuition.schema";
import type { InvoiceLine } from "@/modules/tuition/tuition.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Tổng phải nộp (các dòng trừ miễn giảm, không âm) và tổng đã nộp còn hiệu lực trừ phần đã hoàn của dòng tuition_invoices đang chọn,
// tính trong SQL để danh sách lớn không phải nạp từng dòng. Cùng công thức với trigger payments_within_invoice_total.
// Viết tên bảng đầy đủ: drizzle bỏ tên bảng khi truy vấn chỉ có một bảng, khi đó "id" trong truy vấn con trỏ nhầm sang id của bảng con.
export const INVOICE_TOTAL_SQL = sql<number>`greatest(0, coalesce((SELECT sum(line.amount) FROM invoice_lines line WHERE line.invoice_id = "tuition_invoices"."id"), 0) - "tuition_invoices"."discount")`.mapWith(Number);
export const INVOICE_PAID_SQL = sql<number>`(coalesce((SELECT sum(payment.amount) FROM payments payment WHERE payment.invoice_id = "tuition_invoices"."id" AND payment.voided_at IS NULL), 0) - coalesce((SELECT sum(refund.amount) FROM tuition_refunds refund WHERE refund.invoice_id = "tuition_invoices"."id"), 0))`.mapWith(Number);

// Hạn nộp mặc định của hóa đơn tạm tính: 4 tuần sau ngày bắt đầu học kỳ; Phòng Kế hoạch - Tài chính đặt hạn chính thức khi chốt.
export function defaultDueDate(termStart: string) {
  return dayjs(termStart).add(28, "day").format("YYYY-MM-DD");
}

type Executor = Transaction | typeof db;

async function priceOf(tx: Executor, studentId: string, termId: string) {
  const [row] = await tx
    .select({ academicYear: terms.academicYear, semester: terms.semester, startDate: terms.startDate, pricePerCredit: tuitionRates.pricePerCredit })
    .from(terms)
    .innerJoin(students, eq(students.id, studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .leftJoin(tuitionRates, and(eq(tuitionRates.academicYear, terms.academicYear), eq(tuitionRates.majorId, administrativeClasses.majorId)))
    .where(eq(terms.id, termId));
  return row ?? null;
}

async function enrolledCredits(tx: Executor, studentId: string, termId: string) {
  const [row] = await tx
    .select({ credits: sql<number>`coalesce(sum(${courses.credits}), 0)`.mapWith(Number) })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled"), ne(classSections.status, "cancelled")));
  return row?.credits ?? 0;
}

function lineRows(invoiceId: string, lines: InvoiceLine[], startAt: number) {
  return lines.map((line, index) => ({ invoiceId, position: startAt + index, kind: line.kind, label: line.label, quantity: line.quantity, unitPrice: line.unitPrice }));
}

export type InvoiceSync = { invoiceId: string | null; change: "created" | "updated" | "adjusted" | "removed" | "unchanged" | "unpriced" };

// Hóa đơn học kỳ theo tín chỉ đang đăng ký, gọi trong cùng transaction với mọi thao tác đổi đăng ký (đăng ký, hủy, đổi lớp, hủy lớp,
// đăng ký hộ, xếp từ danh sách chờ). Hóa đơn tạm tính được tính lại cả dòng; hóa đơn đã chốt thì thêm dòng điều chỉnh phần chênh.
// Ngành chưa có đơn giá năm học thì chưa lập hóa đơn (chốt học phí sẽ báo thiếu đơn giá).
// Hóa đơn đã chốt tính phần điều chỉnh theo đơn giá đã chốt trên hóa đơn (dòng học phí), không theo đơn giá hiện hành: đổi bảng
// đơn giá sau khi chốt không làm lệch tiền của tín chỉ thêm, bớt. Ngành chưa có đơn giá vẫn điều chỉnh được nếu hóa đơn đã có giá.
export async function syncTermInvoice(tx: Transaction, studentId: string, termId: string, note = ""): Promise<InvoiceSync> {
  const [price, [invoice], credits] = await Promise.all([
    priceOf(tx, studentId, termId),
    tx
      .select({ id: tuitionInvoices.id, finalizedAt: tuitionInvoices.finalizedAt })
      .from(tuitionInvoices)
      .where(and(eq(tuitionInvoices.studentId, studentId), eq(tuitionInvoices.termId, termId)))
      .for("update"),
    enrolledCredits(tx, studentId, termId),
  ]);
  const current = invoice
    ? await tx
        .select({ position: invoiceLines.position, kind: invoiceLines.kind, label: invoiceLines.label, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id))
        .orderBy(asc(invoiceLines.position))
    : [];

  if (invoice?.finalizedAt) {
    const pricePerCredit = finalizedPricePerCredit(current) ?? price?.pricePerCredit ?? null;
    if (pricePerCredit === null) return { invoiceId: invoice.id, change: "unpriced" };
    const line = adjustmentLine({ creditDelta: credits - billedCredits(current), pricePerCredit, note });
    if (!line) return { invoiceId: invoice.id, change: "unchanged" };
    await tx.insert(invoiceLines).values(lineRows(invoice.id, [line], (current.at(-1)?.position ?? 0) + 1));
    return { invoiceId: invoice.id, change: "adjusted" };
  }

  if (!price || price.pricePerCredit === null) return { invoiceId: null, change: "unpriced" };
  const fees = await tx
    .select({ label: tuitionFees.label, amount: tuitionFees.amount })
    .from(tuitionFees)
    .where(and(eq(tuitionFees.academicYear, price.academicYear), eq(tuitionFees.isMandatory, true)))
    .orderBy(asc(tuitionFees.code));
  const expected = credits > 0 ? buildInvoiceLines({ credits, pricePerCredit: price.pricePerCredit, semester: price.semester, fees }) : [];

  if (!invoice) {
    if (expected.length === 0) return { invoiceId: null, change: "unchanged" };
    const [created] = await tx
      .insert(tuitionInvoices)
      .values({ studentId, termId, dueDate: defaultDueDate(price.startDate) })
      .returning({ id: tuitionInvoices.id });
    await tx.insert(invoiceLines).values(lineRows(created.id, expected, 1));
    return { invoiceId: created.id, change: "created" };
  }

  const same =
    current.length === expected.length &&
    current.every((line, index) => line.kind === expected[index].kind && line.label === expected[index].label && line.quantity === expected[index].quantity && line.unitPrice === expected[index].unitPrice);
  if (same) return { invoiceId: invoice.id, change: "unchanged" };
  await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));
  if (expected.length === 0) {
    // Hủy hết lớp: hóa đơn chưa có tiền nộp thì bỏ hẳn; đã nộp thì giữ (không dòng) để còn số cần hoàn.
    const [[payment], [refund]] = await Promise.all([
      tx.select({ id: payments.id }).from(payments).where(eq(payments.invoiceId, invoice.id)).limit(1),
      tx.select({ id: tuitionRefunds.id }).from(tuitionRefunds).where(eq(tuitionRefunds.invoiceId, invoice.id)).limit(1),
    ]);
    if (!payment && !refund) {
      await tx.delete(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      return { invoiceId: null, change: "removed" };
    }
    return { invoiceId: invoice.id, change: "updated" };
  }
  await tx.insert(invoiceLines).values(lineRows(invoice.id, expected, 1));
  return { invoiceId: invoice.id, change: "updated" };
}

// Khóa đăng ký "học phí" do cán bộ đặt tay tự gỡ khi sinh viên hết nợ các hóa đơn đã chốt và quá hạn (hóa đơn chưa tới hạn không tính).
// Khóa "quá hạn" tính trực tiếp từ hóa đơn học kỳ hiện tại nên tự hết khi nộp đủ.
export async function releaseClearedTuitionHolds(tx: Transaction, studentIds: string[], actor: { id: string | null; name: string }) {
  if (studentIds.length === 0) return [];
  const outstanding = await tx
    .select({ studentId: tuitionInvoices.studentId })
    .from(tuitionInvoices)
    .where(
      and(
        inArray(tuitionInvoices.studentId, studentIds),
        isNotNull(tuitionInvoices.finalizedAt),
        sql`${tuitionInvoices.dueDate} < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
        sql`${INVOICE_TOTAL_SQL} > ${INVOICE_PAID_SQL}`,
      ),
    );
  const owing = new Set(outstanding.map((row) => row.studentId));
  const cleared = studentIds.filter((id) => !owing.has(id));
  if (cleared.length === 0) return [];
  const released = await tx
    .update(registrationHolds)
    .set({ releasedAt: new Date(), releasedByUserId: actor.id, releasedByLabel: `${actor.name}: hết nợ học phí quá hạn` })
    .where(and(inArray(registrationHolds.studentId, cleared), eq(registrationHolds.kind, "tuition"), isNull(registrationHolds.releasedAt)))
    .returning({ studentId: registrationHolds.studentId });
  return released.map((row) => row.studentId);
}

// Hóa đơn học kỳ (thường là học kỳ hiện tại) của một sinh viên để xét khóa đăng ký: số còn nợ, hạn nộp, đã chốt chưa.
export async function invoiceStandingOf(tx: Executor, studentId: string, termId: string) {
  const [row] = await tx
    .select({
      dueDate: tuitionInvoices.dueDate,
      isFinal: sql<boolean>`${tuitionInvoices.finalizedAt} IS NOT NULL`,
      total: INVOICE_TOTAL_SQL,
      paid: INVOICE_PAID_SQL,
      daysToDue: sql<number>`(${tuitionInvoices.dueDate} - (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`.mapWith(Number),
    })
    .from(tuitionInvoices)
    .where(and(eq(tuitionInvoices.studentId, studentId), eq(tuitionInvoices.termId, termId)));
  return row ? { ...row, balance: Math.max(0, row.total - row.paid) } : null;
}
