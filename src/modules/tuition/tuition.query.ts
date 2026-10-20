import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { invoiceView } from "@/modules/tuition/tuition.constant";
import { invoiceTotal, termKeyOf } from "@/modules/tuition/tuition.rule";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL } from "@/modules/tuition/tuition.lib";
import { invoiceLines, payments, tuitionFees, tuitionInvoices, tuitionRates, tuitionRefunds } from "@/modules/tuition/tuition.schema";
import type { AdminInvoiceDetail, AdminInvoiceRow, PaymentRecord, TermTuitionStatus, TuitionFeeRow, TuitionInvoiceView, TuitionRateRow } from "@/modules/tuition/tuition.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Hóa đơn học phí của một sinh viên, học kỳ mới nhất trước. Sinh viên chỉ xem được của chính mình, cán bộ quản trị xem được mọi sinh viên.
// Khoản đã hủy (ghi nhầm) không tính vào số đã nộp và không hiện với sinh viên.
export const getInvoices = cache(async (studentId: string): Promise<TuitionInvoiceView[]> => {
  const session = await requireSession();
  if (!isUuid(studentId)) return [];
  const [owner] = await db.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
  if (!owner) return [];
  if (owner.userId !== session.user.id && !session.roles.includes("admin")) forbidden();

  const invoices = await db
    .select({
      id: tuitionInvoices.id,
      termId: tuitionInvoices.termId,
      termName: terms.name,
      academicYear: terms.academicYear,
      semester: terms.semester,
      issuedAt: tuitionInvoices.issuedAt,
      dueDate: tuitionInvoices.dueDate,
      discount: tuitionInvoices.discount,
      discountReason: tuitionInvoices.discountReason,
      finalizedAt: tuitionInvoices.finalizedAt,
    })
    .from(tuitionInvoices)
    .innerJoin(terms, eq(terms.id, tuitionInvoices.termId))
    .where(eq(tuitionInvoices.studentId, studentId))
    .orderBy(desc(terms.startDate));
  if (invoices.length === 0) return [];
  const ids = invoices.map((invoice) => invoice.id);
  const [lines, paid, refunds] = await Promise.all([
    db
      .select({ invoiceId: invoiceLines.invoiceId, kind: invoiceLines.kind, label: invoiceLines.label, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice, amount: invoiceLines.amount })
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, ids))
      .orderBy(asc(invoiceLines.position)),
    db
      .select({ id: payments.id, invoiceId: payments.invoiceId, paidAt: payments.paidAt, amount: payments.amount, method: payments.method, reference: payments.reference })
      .from(payments)
      .where(and(inArray(payments.invoiceId, ids), isNull(payments.voidedAt)))
      .orderBy(asc(payments.paidAt)),
    db.select({ invoiceId: tuitionRefunds.invoiceId, amount: tuitionRefunds.amount }).from(tuitionRefunds).where(inArray(tuitionRefunds.invoiceId, ids)),
  ]);

  return invoices.map(({ academicYear, semester, issuedAt, finalizedAt, ...invoice }) => {
    const invoiceLinesOf = lines.filter((line) => line.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, ...line }) => line);
    const paymentsOf = paid.filter((payment) => payment.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, paidAt, ...payment }) => ({ ...payment, paidAt: paidAt.toISOString() }));
    const refunded = refunds.filter((refund) => refund.invoiceId === invoice.id).reduce((sum, refund) => sum + refund.amount, 0);
    return invoiceView({
      ...invoice,
      termKey: termKeyOf({ academicYear, semester }),
      issuedAt: issuedAt.toISOString(),
      lines: invoiceLinesOf,
      total: invoiceTotal(invoiceLinesOf, invoice.discount),
      paid: paymentsOf.reduce((sum, payment) => sum + payment.amount, 0) - refunded,
      refunded,
      payments: paymentsOf,
      isFinal: finalizedAt !== null,
    });
  });
});

// Đơn giá tín chỉ của ngành trong năm học của học kỳ; ngành sư phạm được miễn có đơn giá 0. Chưa công bố đơn giá thì trả null.
export async function getTuitionRate(majorCode: string, termId: string): Promise<number | null> {
  await requireSession();
  if (!isUuid(termId)) return null;
  const [rate] = await db
    .select({ pricePerCredit: tuitionRates.pricePerCredit })
    .from(tuitionRates)
    .innerJoin(majors, eq(majors.id, tuitionRates.majorId))
    .innerJoin(terms, eq(terms.academicYear, tuitionRates.academicYear))
    .where(and(eq(majors.code, majorCode), eq(terms.id, termId)));
  return rate?.pricePerCredit ?? null;
}

const ADMIN_INVOICE_COLUMNS = {
  id: tuitionInvoices.id,
  studentId: students.id,
  studentCode: students.code,
  studentName: students.fullName,
  className: administrativeClasses.code,
  faculty: faculties.name,
  termId: terms.id,
  termName: terms.name,
  academicYear: terms.academicYear,
  semester: terms.semester,
  dueDate: tuitionInvoices.dueDate,
  discount: tuitionInvoices.discount,
  discountReason: tuitionInvoices.discountReason,
  finalizedAt: tuitionInvoices.finalizedAt,
  total: INVOICE_TOTAL_SQL,
  paid: INVOICE_PAID_SQL,
};

function adminInvoiceQuery(where: SQL | undefined) {
  return db
    .select(ADMIN_INVOICE_COLUMNS)
    .from(tuitionInvoices)
    .innerJoin(students, eq(students.id, tuitionInvoices.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .innerJoin(terms, eq(terms.id, tuitionInvoices.termId))
    .where(where);
}

function toAdminRow({ academicYear, semester, dueDate, discount: _discount, discountReason: _reason, finalizedAt, studentCode, ...row }: Awaited<ReturnType<typeof adminInvoiceQuery>>[number]): AdminInvoiceRow {
  const isFinal = finalizedAt !== null;
  const view = invoiceView({ id: row.id, termId: row.termId, termKey: "", termName: row.termName, issuedAt: "", dueDate, lines: [], discount: 0, discountReason: "", total: row.total, paid: row.paid, refunded: 0, payments: [], isFinal });
  return {
    ...row,
    studentCode: formatStudentCode(studentCode),
    termKey: termKeyOf({ academicYear, semester }),
    dueDate,
    balance: view.balance,
    refundDue: view.refundDue,
    status: view.status,
    daysToDue: view.daysToDue,
    isFinal,
  };
}

// Danh sách hóa đơn cho Phòng Kế hoạch - Tài chính: theo một học kỳ hoặc mọi học kỳ ("all"); lọc theo MSSV, tên, trạng thái làm tại chỗ.
export async function getAdminInvoices(termId: string | "all"): Promise<AdminInvoiceRow[]> {
  const viewer = await requirePermission("tuition.manage");
  if (termId !== "all" && !isUuid(termId)) return [];
  const rows = await adminInvoiceQuery(termId === "all" ? undefined : eq(tuitionInvoices.termId, termId)).orderBy(desc(terms.startDate), asc(students.code));
  return rows.filter((row) => inScope(viewer, row.faculty)).map(toAdminRow);
}

const PAYMENT_RECORD_COLUMNS = {
  id: payments.id,
  invoiceId: payments.invoiceId,
  paidAt: payments.paidAt,
  amount: payments.amount,
  method: payments.method,
  reference: payments.reference,
  source: payments.source,
  note: payments.note,
  recordedBy: payments.recordedByLabel,
  createdAt: payments.createdAt,
  voidedAt: payments.voidedAt,
  voidedBy: payments.voidedByLabel,
  voidReason: payments.voidReason,
};

// Hóa đơn kèm các dòng và toàn bộ lịch sử thanh toán, gồm cả khoản đã hủy (có lý do, người hủy).
export async function getAdminInvoice(invoiceId: string): Promise<AdminInvoiceDetail | null> {
  const viewer = await requirePermission("tuition.manage");
  if (!isUuid(invoiceId)) return null;
  const [row] = await adminInvoiceQuery(eq(tuitionInvoices.id, invoiceId));
  if (!row || !inScope(viewer, row.faculty)) return null;
  const [lines, history, refunds] = await Promise.all([
    db
      .select({ kind: invoiceLines.kind, label: invoiceLines.label, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice, amount: invoiceLines.amount })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.position)),
    db.select(PAYMENT_RECORD_COLUMNS).from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(asc(payments.paidAt), asc(payments.createdAt)),
    db
      .select({ id: tuitionRefunds.id, amount: tuitionRefunds.amount, refundedAt: tuitionRefunds.refundedAt, method: tuitionRefunds.method, reference: tuitionRefunds.reference, note: tuitionRefunds.note, recordedBy: tuitionRefunds.recordedByLabel })
      .from(tuitionRefunds)
      .where(eq(tuitionRefunds.invoiceId, invoiceId))
      .orderBy(asc(tuitionRefunds.refundedAt)),
  ]);
  return {
    ...toAdminRow(row),
    discount: row.discount,
    discountReason: row.discountReason,
    refunds: refunds.map(({ refundedAt, ...refund }) => ({ ...refund, refundedAt: refundedAt.toISOString() })),
    lines,
    payments: history.map(
      ({ paidAt, createdAt, voidedAt, ...payment }): PaymentRecord => ({
        ...payment,
        paidAt: paidAt.toISOString(),
        createdAt: createdAt.toISOString(),
        voidedAt: voidedAt?.toISOString() ?? null,
      }),
    ),
  };
}

// Học kỳ có hóa đơn, mới nhất trước, để chọn trong bộ lọc.
export async function getInvoiceTerms(): Promise<{ id: string; name: string; isCurrent: boolean }[]> {
  await requirePermission("tuition.manage");
  return db
    .selectDistinct({ id: terms.id, name: terms.name, isCurrent: terms.isCurrent, startDate: terms.startDate })
    .from(terms)
    .innerJoin(tuitionInvoices, eq(tuitionInvoices.termId, terms.id))
    .orderBy(desc(terms.startDate))
    .then((rows) => rows.map(({ startDate: _startDate, ...term }) => term));
}

// Đơn giá tín chỉ theo ngành và năm học, khoản thu cố định theo năm học, cho trang cấu hình học phí.
export async function getTuitionRates(): Promise<TuitionRateRow[]> {
  await requirePermission("tuition.manage");
  return db
    .select({ id: tuitionRates.id, academicYear: tuitionRates.academicYear, majorCode: majors.code, majorName: majors.name, pricePerCredit: tuitionRates.pricePerCredit, note: tuitionRates.note })
    .from(tuitionRates)
    .innerJoin(majors, eq(majors.id, tuitionRates.majorId))
    .orderBy(desc(tuitionRates.academicYear), asc(majors.code));
}

export async function getTuitionFees(): Promise<TuitionFeeRow[]> {
  await requirePermission("tuition.manage");
  return db
    .select({ id: tuitionFees.id, academicYear: tuitionFees.academicYear, code: tuitionFees.code, label: tuitionFees.label, amount: tuitionFees.amount, isMandatory: tuitionFees.isMandatory })
    .from(tuitionFees)
    .orderBy(desc(tuitionFees.academicYear), asc(tuitionFees.code));
}

// Học kỳ hiện tại và học kỳ nhận đăng ký kèm số hóa đơn tạm tính, để Phòng Kế hoạch - Tài chính chốt học phí.
export async function getTermTuitionStatus(): Promise<TermTuitionStatus[]> {
  await requirePermission("tuition.manage");
  const rows = await db
    .select({
      termId: terms.id,
      termName: terms.name,
      invoices: sql<number>`count(${tuitionInvoices.id})`.mapWith(Number),
      provisional: sql<number>`count(${tuitionInvoices.id}) FILTER (WHERE ${tuitionInvoices.finalizedAt} IS NULL)`.mapWith(Number),
      finalizedAt: sql<string | null>`max(${tuitionInvoices.finalizedAt})::text`,
    })
    .from(terms)
    .leftJoin(tuitionInvoices, eq(tuitionInvoices.termId, terms.id))
    .where(sql`${terms.isCurrent} OR ${terms.isRegistrationTarget}`)
    .groupBy(terms.id)
    .orderBy(asc(terms.startDate));
  return rows.map((row) => ({ ...row, finalizedAt: row.finalizedAt ? new Date(row.finalizedAt).toISOString() : null }));
}
