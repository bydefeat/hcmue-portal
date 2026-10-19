import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { invoiceView, transferContent, TUITION_CONSTRAINT_MESSAGE } from "@/modules/tuition/tuition.constant";
import { buildInvoiceLines, invoiceTotal, termKeyOf } from "@/modules/tuition/tuition.rule";
import { invoiceLines, payments, tuitionInvoices } from "@/modules/tuition/tuition.schema";
import type { TuitionInvoice } from "@/modules/tuition/tuition.type";

after(() => db.$client.end());

const INSURANCE = { label: "Bảo hiểm y tế 12 tháng", amount: 1_263_600 };

describe("tuition: tính hóa đơn", () => {
  test("học kỳ 1 thu học phí theo tín chỉ và bảo hiểm y tế, học kỳ 2 chỉ học phí", () => {
    const first = buildInvoiceLines({ credits: 15, pricePerCredit: 520_000, semester: 1, fees: [INSURANCE] });
    assert.deepEqual(
      first.map((line) => [line.label, line.amount]),
      [
        ["Học phí 15 tín chỉ", 7_800_000],
        ["Bảo hiểm y tế 12 tháng", 1_263_600],
      ],
    );
    assert.equal(invoiceTotal(first, 0), 9_063_600);
    const second = buildInvoiceLines({ credits: 15, pricePerCredit: 520_000, semester: 2, fees: [INSURANCE] });
    assert.equal(second.length, 1);
    assert.equal(invoiceTotal(second, 8_000_000), 0);
  });

  test("ngành sư phạm miễn học phí: dòng học phí 0 đồng ghi rõ căn cứ", () => {
    const [line] = buildInvoiceLines({ credits: 12, pricePerCredit: 0, semester: 2, fees: [] });
    assert.equal(line.amount, 0);
    assert.match(line.label, /Nghị định 116/);
  });

  test("nội dung chuyển khoản giữ MSSV 10 chữ số và khóa học kỳ", () => {
    assert.equal(transferContent("50.01.104.009", termKeyOf({ academicYear: 2026, semester: 1 })), "HP 5001104009 HK1-2026");
  });

  test("trạng thái hóa đơn suy từ số đã nộp và hạn nộp", () => {
    const base: TuitionInvoice = {
      id: "x",
      termId: "x",
      termKey: "hk1-2026",
      termName: "",
      issuedAt: dayjs().subtract(20, "day").toISOString(),
      dueDate: dayjs().add(5, "day").toISOString(),
      lines: [],
      discount: 0,
      total: 1_000_000,
      paid: 0,
      payments: [],
    };
    assert.equal(invoiceView(base).status, "unpaid");
    assert.equal(invoiceView({ ...base, paid: 400_000 }).status, "partial");
    assert.equal(invoiceView({ ...base, paid: 400_000 }).balance, 600_000);
    assert.equal(invoiceView({ ...base, dueDate: dayjs().subtract(1, "day").toISOString() }).status, "overdue");
    assert.equal(invoiceView({ ...base, paid: 1_000_000, dueDate: dayjs().subtract(1, "day").toISOString() }).status, "paid");
  });
});

describe("tuition: ràng buộc ở DB", () => {
  test("thành tiền mỗi dòng do DB tính bằng số lượng nhân đơn giá", async () => {
    const [line] = await db.select().from(invoiceLines).limit(1);
    assert.equal(line.amount, line.quantity * line.unitPrice);
  });

  test("mỗi sinh viên một hóa đơn mỗi học kỳ", async () => {
    const [invoice] = await db.select().from(tuitionInvoices).limit(1);
    const error = await db
      .insert(tuitionInvoices)
      .values({ studentId: invoice.studentId, termId: invoice.termId, dueDate: invoice.dueDate })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.tuition_invoices_student_id_term_id_unique);
  });

  test("thanh toán 0 đồng và trùng mã giao dịch bị chặn", async () => {
    const [payment] = await db.select().from(payments).limit(1);
    const zero = await db
      .update(payments)
      .set({ amount: 0 })
      .where(eq(payments.id, payment.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(zero, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.payments_amount_positive);
    const duplicate = await db
      .insert(payments)
      .values({ invoiceId: payment.invoiceId, paidAt: new Date(), amount: 1000, method: "Thử", reference: payment.reference })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.payments_reference_unique);
  });
});
