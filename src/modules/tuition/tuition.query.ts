import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
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
import { invoiceLines, payments, tuitionInvoices, tuitionRates } from "@/modules/tuition/tuition.schema";
import type { AdminInvoiceDetail, AdminInvoiceRow, PaymentRecord, TuitionInvoiceView } from "@/modules/tuition/tuition.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

// Hạn nộp lưu theo ngày; hết giờ làm việc 17:00 của ngày đó mới tính quá hạn.
const DUE_HOUR = 17;

export function dueDateTime(dueDate: string) {
  return dayjs(dueDate).hour(DUE_HOUR).toISOString();
}

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
    })
    .from(tuitionInvoices)
    .innerJoin(terms, eq(terms.id, tuitionInvoices.termId))
    .where(eq(tuitionInvoices.studentId, studentId))
    .orderBy(desc(terms.startDate));
  if (invoices.length === 0) return [];
  const ids = invoices.map((invoice) => invoice.id);
  const [lines, paid] = await Promise.all([
    db
      .select({ invoiceId: invoiceLines.invoiceId, label: invoiceLines.label, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice, amount: invoiceLines.amount })
      .from(invoiceLines)
      .where(inArray(invoiceLines.invoiceId, ids))
      .orderBy(asc(invoiceLines.position)),
    db
      .select({ id: payments.id, invoiceId: payments.invoiceId, paidAt: payments.paidAt, amount: payments.amount, method: payments.method, reference: payments.reference })
      .from(payments)
      .where(and(inArray(payments.invoiceId, ids), isNull(payments.voidedAt)))
      .orderBy(asc(payments.paidAt)),
  ]);

  return invoices.map(({ academicYear, semester, issuedAt, dueDate, ...invoice }) => {
    const invoiceLinesOf = lines.filter((line) => line.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, ...line }) => line);
    const paymentsOf = paid.filter((payment) => payment.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, paidAt, ...payment }) => ({ ...payment, paidAt: paidAt.toISOString() }));
    return invoiceView({
      ...invoice,
      termKey: termKeyOf({ academicYear, semester }),
      issuedAt: issuedAt.toISOString(),
      dueDate: dueDateTime(dueDate),
      lines: invoiceLinesOf,
      total: invoiceTotal(invoiceLinesOf, invoice.discount),
      paid: paymentsOf.reduce((sum, payment) => sum + payment.amount, 0),
      payments: paymentsOf,
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

function toAdminRow({ academicYear, semester, dueDate, discount: _discount, studentCode, ...row }: Awaited<ReturnType<typeof adminInvoiceQuery>>[number]): AdminInvoiceRow {
  const view = invoiceView({ id: row.id, termId: row.termId, termKey: "", termName: row.termName, issuedAt: "", dueDate: dueDateTime(dueDate), lines: [], discount: 0, total: row.total, paid: row.paid, payments: [] });
  return { ...row, studentCode: formatStudentCode(studentCode), termKey: termKeyOf({ academicYear, semester }), dueDate: view.dueDate, balance: view.balance, status: view.status, daysToDue: view.daysToDue };
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
  const [lines, history] = await Promise.all([
    db
      .select({ label: invoiceLines.label, quantity: invoiceLines.quantity, unitPrice: invoiceLines.unitPrice, amount: invoiceLines.amount })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.position)),
    db.select(PAYMENT_RECORD_COLUMNS).from(payments).where(eq(payments.invoiceId, invoiceId)).orderBy(asc(payments.paidAt), asc(payments.createdAt)),
  ]);
  return {
    ...toAdminRow(row),
    discount: row.discount,
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
