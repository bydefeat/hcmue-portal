import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, isNull, sql, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { invoiceView, transferContent, TUITION_CONSTRAINT_MESSAGE } from "@/modules/tuition/tuition.constant";
import {
  buildInvoiceLines,
  invoiceKey,
  invoiceTotal,
  parseMoney,
  parseStatement,
  parseStatementDate,
  parseTransferContent,
  reconcileStatement,
  termKeyOf,
  type ReconcileInvoice,
} from "@/modules/tuition/tuition.rule";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL } from "@/modules/tuition/tuition.lib";
import { invoiceLines, payments, tuitionInvoices } from "@/modules/tuition/tuition.schema";
import type { StatementLine, TuitionInvoice } from "@/modules/tuition/tuition.type";

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

function statementLine(n: number, reference: string, amount: number, content = "HP 5001104009 HK1-2026"): StatementLine {
  return { line: n, reference, amount, content, paidAt: "2026-10-19T03:00:00.000Z" };
}

describe("tuition: đọc và đối chiếu sao kê", () => {
  test("nội dung chuyển khoản: chấp nhận viết hoa, thiếu gạch, MSSV có dấu chấm, chữ thừa trước sau", () => {
    assert.deepEqual(parseTransferContent("HP 5001104009 HK1-2026"), { studentCode: "5001104009", termKey: "hk1-2026" });
    assert.deepEqual(parseTransferContent("NGUYEN VAN A hp 50.01.104.009 hk1 2026 chuyen tien"), { studentCode: "5001104009", termKey: "hk1-2026" });
    assert.deepEqual(parseTransferContent("HP5001104009HK22025"), { studentCode: "5001104009", termKey: "hk2-2025" });
    assert.equal(parseTransferContent("Hoc phi 5001104009"), null);
    assert.equal(parseTransferContent("HP 500110400 HK1-2026"), null);
  });

  test("số tiền theo nhiều kiểu viết, ngày giờ theo giờ Việt Nam", () => {
    assert.equal(parseMoney("9.063.600"), 9_063_600);
    assert.equal(parseMoney("9,063,600"), 9_063_600);
    assert.equal(parseMoney("9.063.600,00"), 9_063_600);
    assert.equal(parseMoney("9063600"), 9_063_600);
    assert.equal(parseMoney("1,5"), 2);
    assert.equal(parseMoney("-500.000"), null);
    assert.equal(parseMoney("abc"), null);
    assert.equal(parseStatementDate("19/10/2026 10:15"), "2026-10-19T03:15:00.000Z");
    assert.equal(parseStatementDate("2026-10-19"), "2026-10-18T17:00:00.000Z");
    assert.equal(parseStatementDate("31/02/2026"), null);
    assert.equal(parseStatementDate("hôm qua"), null);
  });

  test("tìm dòng tiêu đề dưới phần đầu sao kê, bỏ dòng tiền ra, báo dòng lỗi theo số dòng trong tệp", () => {
    const parsed = parseStatement([
      ["NGÂN HÀNG BIDV - SAO KÊ TÀI KHOẢN"],
      ["Số tài khoản: 3101000066889"],
      ["Ngày giao dịch", "Mã giao dịch", "Ghi nợ", "Ghi có", "Nội dung"],
      ["19/10/2026 09:15", "ft001", "", "9.063.600", "HP 5001104009 HK1-2026"],
      ["19/10/2026 09:20", "FT002", "50.000", "", "Phí dịch vụ"],
      ["ngày sai", "FT003", "", "100000", "HP 5001104010 HK1-2026"],
    ]);
    assert.ok(typeof parsed !== "string");
    assert.equal(parsed.skipped, 1);
    assert.deepEqual(
      parsed.lines.map((line) => [line.line, line.reference, line.amount]),
      [[4, "FT001", 9_063_600]],
    );
    assert.deepEqual(
      parsed.invalid.map((row) => [row.line, row.status]),
      [[6, "invalid"]],
    );
    assert.match(String(parseStatement([["A", "B"]])), /Không thấy dòng tiêu đề/);
  });

  test("đối chiếu: khớp, nộp thiếu, chuyển thừa, trùng mã, không có hóa đơn; dòng sau tính trên số còn lại", () => {
    const invoice: ReconcileInvoice = { invoiceId: "hd-1", balance: 5_000_000, studentCode: "50.01.104.009", studentName: "Phạm Gia Đạt", termName: "HK1" };
    const invoices = new Map([[invoiceKey("5001104009", "hk1-2026"), invoice]]);
    const rows = reconcileStatement(
      [statementLine(2, "A1", 3_000_000), statementLine(3, "A2", 2_000_000), statementLine(4, "A3", 1_000), statementLine(5, "A1", 10), statementLine(6, "OLD", 10), statementLine(7, "B1", 100, "HP 5001104999 HK1-2026"), statementLine(8, "C1", 100, "chuyen tien")],
      invoices,
      new Set(["OLD"]),
      new Date("2026-10-19T05:00:00Z"),
    );
    assert.deepEqual(
      rows.map((row) => row.status),
      ["partial", "matched", "over", "duplicate", "duplicate", "unmatched", "unmatched"],
    );
    assert.equal(rows[1].balance, 2_000_000);
    assert.equal(rows[0].invoiceId, "hd-1");
    const future = reconcileStatement([statementLine(2, "Z1", 100)], invoices, new Set(), new Date("2026-10-18T00:00:00Z"));
    assert.equal(future[0].status, "invalid");
  });
});

class Rollback extends Error {}

// Chạy trong transaction rồi bỏ hết, không để lại dữ liệu cho test khác.
async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError) && !(error instanceof Rollback)) throw error;
    });
}

const caught = (promise: Promise<unknown>) => promise.then(() => null).catch((error: unknown) => error);

describe("tuition: ghi và hủy thanh toán", () => {
  test("không ghi vượt số còn nợ, khoản đã hủy không tính, mã giao dịch đã hủy ghi lại được", async () => {
    await inRollback(async (tx) => {
      const [invoice] = await tx
        .select({ id: tuitionInvoices.id, total: INVOICE_TOTAL_SQL, paid: INVOICE_PAID_SQL })
        .from(tuitionInvoices)
        .where(sql`${INVOICE_TOTAL_SQL} - ${INVOICE_PAID_SQL} > 100000`)
        .limit(1);
      const balance = invoice.total - invoice.paid;
      const values = { invoiceId: invoice.id, paidAt: new Date(), method: "Thử", source: "manual" as const, recordedByLabel: "Kiểm thử" };

      const over = await caught(tx.transaction((sp) => sp.insert(payments).values({ ...values, amount: balance + 1, reference: "TEST-OVER" })));
      assert.equal(pgErrorMessage(over, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.payments_within_invoice_total);

      const [first] = await tx.insert(payments).values({ ...values, amount: 100_000, reference: "TEST-REF-1" }).returning({ id: payments.id });
      const [recorded] = await tx.select({ paid: INVOICE_PAID_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      assert.equal(recorded.paid, invoice.paid + 100_000);

      const halfVoid = await caught(tx.transaction((sp) => sp.update(payments).set({ voidedAt: new Date() }).where(eq(payments.id, first.id))));
      assert.equal(pgErrorMessage(halfVoid, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.payments_void_fields);

      await tx.update(payments).set({ voidedAt: new Date(), voidedByLabel: "Kiểm thử", voidReason: "Ghi nhầm hóa đơn" }).where(eq(payments.id, first.id));
      const [voided] = await tx.select({ paid: INVOICE_PAID_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      assert.equal(voided.paid, invoice.paid);

      // Mã của khoản đã hủy ghi lại được; mã đang hiệu lực thì không.
      await tx.insert(payments).values({ ...values, amount: balance, reference: "TEST-REF-1" });
      const duplicate = await caught(tx.transaction((sp) => sp.insert(payments).values({ ...values, amount: 1000, reference: "TEST-REF-1" })));
      assert.equal(pgErrorMessage(duplicate, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.payments_reference_unique);
      const [paidUp] = await tx.select({ total: INVOICE_TOTAL_SQL, paid: INVOICE_PAID_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      assert.equal(paidUp.paid, paidUp.total);
      const active = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.reference, "TEST-REF-1"), isNull(payments.voidedAt)));
      assert.equal(active.length, 1);
    });
  });
});
