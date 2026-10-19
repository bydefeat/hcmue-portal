import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { majors } from "@/modules/curriculum/curriculum.schema";
import { invoiceView } from "@/modules/tuition/tuition.constant";
import { invoiceTotal, termKeyOf } from "@/modules/tuition/tuition.rule";
import { invoiceLines, payments, tuitionInvoices, tuitionRates } from "@/modules/tuition/tuition.schema";
import type { TuitionInvoiceView } from "@/modules/tuition/tuition.type";
import { students } from "@/modules/users/users.schema";

// Hạn nộp lưu theo ngày; hết giờ làm việc 17:00 của ngày đó mới tính quá hạn.
const DUE_HOUR = 17;

// Hóa đơn học phí của một sinh viên, học kỳ mới nhất trước. Sinh viên chỉ xem được của chính mình, cán bộ quản trị xem được mọi sinh viên.
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
      .where(inArray(payments.invoiceId, ids))
      .orderBy(asc(payments.paidAt)),
  ]);

  return invoices.map(({ academicYear, semester, issuedAt, dueDate, ...invoice }) => {
    const invoiceLinesOf = lines.filter((line) => line.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, ...line }) => line);
    const paymentsOf = paid.filter((payment) => payment.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, paidAt, ...payment }) => ({ ...payment, paidAt: paidAt.toISOString() }));
    return invoiceView({
      ...invoice,
      termKey: termKeyOf({ academicYear, semester }),
      issuedAt: issuedAt.toISOString(),
      dueDate: dayjs(dueDate).hour(DUE_HOUR).toISOString(),
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
