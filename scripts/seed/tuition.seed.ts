import { and, eq, sum } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { MOCK_MAJORS, mockTermId } from "@/shared/libs/mock.lib";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { mockTranscriptTerms } from "@/modules/grades/grades.mock";
import { PRICE_PER_CREDIT } from "@/modules/tuition/tuition.constant";
import { HEALTH_INSURANCE, mockInvoice, TUITION_YEARS } from "@/modules/tuition/tuition.mock";
import { buildInvoiceLines } from "@/modules/tuition/tuition.rule";
import { invoiceLines, payments, tuitionFees, tuitionInvoices, tuitionRates } from "@/modules/tuition/tuition.schema";
import { CURRENT_STUDENT_ID, STUDENTS } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

const CURRENT_TERM_KEY = "hk1-2026";

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
  return { invoices: invoices.length };
}
