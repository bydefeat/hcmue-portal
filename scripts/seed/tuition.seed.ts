import { and, eq, sum } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { MOCK_MAJORS, mockId, mockTermId } from "@/shared/libs/mock.lib";
import { enrollments, registrationHolds } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { mockTranscriptTerms } from "@/modules/grades/grades.mock";
import { formatMoney, PRICE_PER_CREDIT } from "@/modules/tuition/tuition.constant";
import { syncTermInvoice } from "@/modules/tuition/tuition.lib";
import { HEALTH_INSURANCE, mockInvoice, TUITION_YEARS } from "@/modules/tuition/tuition.mock";
import { buildInvoiceLines, invoiceTotal } from "@/modules/tuition/tuition.rule";
import { invoiceLines, payments, tuitionFees, tuitionInvoices, tuitionRates } from "@/modules/tuition/tuition.schema";
import { CURRENT_STUDENT_ID, STUDENTS } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

const CURRENT_TERM_KEY = "hk1-2026";
const TARGET_TERM_KEY = "hk2-2026";

// Khóa học phí mẫu (REGISTRATION_HOLDS) phải khớp hóa đơn: sinh viên còn nợ đúng học kỳ ghi trong lý do khóa.
// share là phần còn nợ trên tổng hóa đơn, amount là số còn nợ cố định.
const HOLD_DEBTS: { index: number; termKey: string; share?: number; amount?: number }[] = [
  { index: 29, termKey: "hk2-2025", share: 0.6 },
  { index: 130, termKey: "hk1-2025", share: 1 },
  { index: 96, termKey: CURRENT_TERM_KEY, amount: 1_040_000 },
];

async function insertChunked<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += 500) await insert(rows.slice(start, start + 500));
}

// Đơn giá tín chỉ và khoản thu cố định theo năm học, rồi hóa đơn từng học kỳ: học kỳ đã qua tính theo bảng điểm mẫu,
// học kỳ hiện tại tính theo số tín chỉ đăng ký thật trong enrollments.
export async function seedTuition(tx: Transaction, context: SeedContext) {
  await tx.insert(tuitionRates).values(
    TUITION_YEARS.flatMap((academicYear) =>
      MOCK_MAJORS.map((major) => ({ academicYear, majorId: context.majorByCode.get(major.code)!.id, pricePerCredit: PRICE_PER_CREDIT[major.code] ?? 0 })),
    ),
  );
  await tx.insert(tuitionFees).values(TUITION_YEARS.map((academicYear) => ({ academicYear, code: HEALTH_INSURANCE.code, label: HEALTH_INSURANCE.label, amount: HEALTH_INSURANCE.amount })));

  const termById = new Map([...context.termByKey.values()].map((term) => [term.id, term]));
  const currentTerm = context.termByKey.get(CURRENT_TERM_KEY)!;
  const enrolled = await tx
    .select({ studentId: enrollments.studentId, credits: sum(courses.credits).mapWith(Number) })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.termId, mockTermId(CURRENT_TERM_KEY)), eq(enrollments.status, "enrolled")))
    .groupBy(enrollments.studentId);
  const currentCredits = new Map(enrolled.map((row) => [row.studentId, row.credits]));

  const invoices: ReturnType<typeof mockInvoice>[] = [];
  STUDENTS.forEach((student, index) => {
    const pricePerCredit = PRICE_PER_CREDIT[student.majorCode] ?? 0;
    const bill = (termId: string, credits: number, isCurrent: boolean) => {
      const term = termById.get(termId)!;
      const lines = buildInvoiceLines({ credits, pricePerCredit, semester: term.semester, fees: [HEALTH_INSURANCE] });
      if (lines.length === 0) return;
      invoices.push(mockInvoice({ studentId: student.id, studentIndex: index, isCurrentStudent: student.id === CURRENT_STUDENT_ID, term, isCurrent, lines }));
    };
    for (const entry of mockTranscriptTerms(index).filter((term) => !term.isInProgress)) {
      bill(
        entry.termId,
        entry.courses.reduce((total, course) => total + course.credits, 0),
        false,
      );
    }
    const credits = currentCredits.get(student.id);
    if (credits) bill(currentTerm.id, credits, true);
  });

  const debts: { studentId: string; debt: number }[] = [];
  for (const hold of HOLD_DEBTS) {
    const student = STUDENTS[hold.index];
    const term = context.termByKey.get(hold.termKey);
    const entry = term && invoices.find((invoice) => invoice.invoice.id === mockId(`invoice:${student.id}:${term.id}`));
    if (!entry) continue;
    const total = invoiceTotal(entry.lines.map((line) => ({ ...line, amount: line.quantity * line.unitPrice })), 0);
    const debt = Math.min(total, hold.amount ?? Math.round((total * (hold.share ?? 1)) / 1000) * 1000);
    const paid = total - debt;
    const [payment] = entry.payments;
    entry.payments = paid > 0 ? [{ ...(payment ?? { id: mockId(`payment:${entry.invoice.id}:1`), invoiceId: entry.invoice.id, paidAt: new Date(entry.invoice.issuedAt), method: "Chuyển khoản (nhập sao kê)", source: "statement" as const, recordedByLabel: "Phòng Kế hoạch - Tài chính", reference: `FTHOLD${hold.index}` }), amount: paid }] : [];
    debts.push({ studentId: student.id, debt });
  }

  await insertChunked(
    invoices.map((entry) => entry.invoice),
    (chunk) => tx.insert(tuitionInvoices).values(chunk),
  );
  await insertChunked(
    invoices.flatMap((entry) => entry.lines),
    (chunk) => tx.insert(invoiceLines).values(chunk),
  );
  await insertChunked(
    invoices.flatMap((entry) => entry.payments),
    (chunk) => tx.insert(payments).values(chunk),
  );
  for (const { studentId, debt } of debts) {
    const [hold] = await tx.select({ id: registrationHolds.id, reason: registrationHolds.reason }).from(registrationHolds).where(and(eq(registrationHolds.studentId, studentId), eq(registrationHolds.kind, "tuition")));
    if (hold) await tx.update(registrationHolds).set({ reason: `${hold.reason}: ${formatMoney(debt)}` }).where(eq(registrationHolds.id, hold.id));
  }

  // Học kỳ đang nhận đăng ký: hóa đơn tạm tính lập bằng đúng hàm chạy sau mỗi lần đăng ký.
  const target = context.termByKey.get(TARGET_TERM_KEY)!;
  const registered = await tx.selectDistinct({ studentId: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.termId, target.id), eq(enrollments.status, "enrolled")));
  for (const { studentId } of registered) await syncTermInvoice(tx, studentId, target.id);
  return { invoices: invoices.length + registered.length };
}
