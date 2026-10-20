"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, InputError, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate } from "@/shared/libs/date.lib";
import { parseCsv } from "@/shared/libs/download.lib";
import { readSpreadsheet } from "@/shared/libs/spreadsheet.lib";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { formatMoney, TUITION_CONSTRAINT_MESSAGE } from "@/modules/tuition/tuition.constant";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL, releaseClearedTuitionHolds, syncTermInvoice } from "@/modules/tuition/tuition.lib";
import { getAdminInvoice } from "@/modules/tuition/tuition.query";
import {
  DISCOUNT_SCHEMA,
  FEE_SCHEMA,
  FINALIZE_SCHEMA,
  invoiceKey,
  parseStatement,
  parseTransferContent,
  PAYMENT_SCHEMA,
  RATE_SCHEMA,
  RECORDABLE_STATEMENT_STATUSES,
  REFUND_SCHEMA,
  reconcileStatement,
  STATEMENT_IMPORT_SCHEMA,
  STATEMENT_METHOD,
  termKeyOf,
  VOID_PAYMENT_SCHEMA,
  type DiscountInput,
  type FeeInput,
  type FinalizeInput,
  type PaymentInput,
  type RateInput,
  type RefundInput,
  type ReconcileInvoice,
  type StatementImportInput,
  type VoidPaymentInput,
} from "@/modules/tuition/tuition.rule";
import { payments, tuitionFees, tuitionInvoices, tuitionRates, tuitionRefunds } from "@/modules/tuition/tuition.schema";
import type { AdminInvoiceDetail, StatementLine, StatementPreview } from "@/modules/tuition/tuition.type";
import { administrativeClasses, students } from "@/modules/users/users.schema";

const TUITION_HREF = "/application/tuition";
const MISSING = "Hóa đơn không còn tồn tại, tải lại trang.";
// Giới hạn mặc định của server action là 1 MB cho cả yêu cầu.
const STATEMENT_MAX_BYTES = 900 * 1024;

function failure(error: unknown) {
  return actionFailure(error, TUITION_CONSTRAINT_MESSAGE);
}

function revalidateTuition() {
  revalidatePath("/administrator/tuition");
  revalidatePath("/application/tuition");
  revalidatePath("/application/registration");
  revalidatePath("/application/dashboard");
}

// Hóa đơn kèm sinh viên, học kỳ, số phải nộp và đã nộp; khóa dòng hóa đơn để hai người ghi cùng lúc phải chờ nhau.
async function lockInvoices(tx: Transaction, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return [];
  await tx
    .select({ id: tuitionInvoices.id })
    .from(tuitionInvoices)
    .where(inArray(tuitionInvoices.id, invoiceIds))
    .orderBy(asc(tuitionInvoices.id))
    .for("update");
  return tx
    .select({
      id: tuitionInvoices.id,
      studentId: students.id,
      studentCode: students.code,
      studentName: students.fullName,
      faculty: faculties.name,
      termName: terms.name,
      academicYear: terms.academicYear,
      semester: terms.semester,
      discount: tuitionInvoices.discount,
      total: INVOICE_TOTAL_SQL,
      paid: INVOICE_PAID_SQL,
    })
    .from(tuitionInvoices)
    .innerJoin(students, eq(students.id, tuitionInvoices.studentId))
    .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
    .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
    .innerJoin(faculties, eq(faculties.id, majors.facultyId))
    .innerJoin(terms, eq(terms.id, tuitionInvoices.termId))
    .where(inArray(tuitionInvoices.id, invoiceIds));
}

function statementMessage(unlocked: boolean) {
  return {
    kind: "system" as const,
    title: "Đã ghi nhận khoản chuyển khoản học phí",
    body: `Phòng Kế hoạch - Tài chính đã ghi nhận khoản chuyển khoản học phí của bạn từ sao kê ngân hàng. Xem số đã nộp và số còn phải nộp ở trang Học phí.${unlocked ? " Khóa đăng ký do học phí đã được gỡ." : ""}`,
    href: TUITION_HREF,
  };
}

function balanceText(balance: number) {
  return balance > 0 ? `Còn phải nộp ${formatMoney(balance)}.` : "Bạn đã nộp đủ học phí học kỳ này.";
}

async function reloadInvoice(invoiceId: string): Promise<ActionResult<AdminInvoiceDetail>> {
  const invoice = await getAdminInvoice(invoiceId);
  return invoice ? actionOk(invoice) : actionError("Đã lưu nhưng chưa đọc lại được, tải lại trang.");
}

// Ghi tay một khoản đã thu (tiền mặt, quẹt thẻ, chuyển khoản sai nội dung). Không nhận số vượt số còn nợ: phần thừa phải làm thủ tục
// hoàn trả, không treo thành số dư âm trên hóa đơn. DB chặn lần cuối bằng trigger payments_within_invoice_total.
export async function recordPayment(input: PaymentInput): Promise<ActionResult<AdminInvoiceDetail>> {
  const viewer = await requirePermission("tuition.manage");
  const parsed = parseInput(PAYMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  if (new Date(values.paidAt).getTime() > Date.now() + 60_000) return actionError("Ngày nộp không được sau hôm nay.", { paidAt: "Ngày nộp không được sau hôm nay" });
  try {
    await db.transaction(async (tx) => {
      const [invoice] = await lockInvoices(tx, [values.invoiceId]);
      if (!invoice || !inScope(viewer, invoice.faculty)) throw new InputError(MISSING);
      const balance = Math.max(0, invoice.total - invoice.paid);
      if (balance === 0) throw new InputError("Hóa đơn đã nộp đủ, không ghi thêm được.", "amount");
      if (values.amount > balance) throw new InputError(`Số còn nợ là ${formatMoney(balance)}. Ghi tối đa số này, phần thừa làm thủ tục hoàn trả.`, "amount");
      const [duplicate] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.reference, values.reference), isNull(payments.voidedAt)));
      if (duplicate) throw new InputError("Mã tham chiếu này đã được ghi nhận cho một khoản khác.", "reference");
      await tx.insert(payments).values({
        invoiceId: invoice.id,
        paidAt: new Date(values.paidAt),
        amount: values.amount,
        method: values.method,
        reference: values.reference,
        note: values.note,
        source: "manual",
        recordedByUserId: viewer.id,
        recordedByLabel: viewer.name,
      });
      const after = balance - values.amount;
      const released = await releaseClearedTuitionHolds(tx, [invoice.studentId], viewer);
      await notifyStudents(tx, [invoice.studentId], {
        kind: "system",
        title: `Đã ghi nhận ${formatMoney(values.amount)} học phí ${invoice.termName}`,
        body: `Phòng Kế hoạch - Tài chính đã ghi nhận khoản nộp ngày ${formatDate(values.paidAt)} (${values.method}, mã ${values.reference}). ${balanceText(after)}${released.length > 0 ? " Khóa đăng ký do học phí đã được gỡ." : ""}`,
        href: TUITION_HREF,
      });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "create",
        entityType: "student",
        entityId: invoice.studentId,
        entityLabel: `${formatStudentCode(invoice.studentCode)} ${invoice.studentName}`,
        summary: `Ghi nhận ${formatMoney(values.amount)} học phí ${invoice.termName}, ${values.method}, mã ${values.reference}`,
        changes: [{ field: "Đã nộp", before: formatMoney(invoice.paid), after: formatMoney(invoice.paid + values.amount) }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return reloadInvoice(values.invoiceId);
}

// Hủy khoản ghi nhầm (sai hóa đơn, sai số tiền): giữ dòng cùng lý do để còn đối chiếu sao kê, mã giao dịch được ghi lại cho đúng hóa đơn.
// Hủy làm hóa đơn còn nợ và đã quá hạn thì khóa đăng ký do học phí tự có lại vì tính từ hóa đơn.
export async function voidPayment(input: VoidPaymentInput): Promise<ActionResult<AdminInvoiceDetail>> {
  const viewer = await requirePermission("tuition.manage");
  const parsed = parseInput(VOID_PAYMENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { paymentId, reason } = parsed.data;
  let invoiceId: string;
  try {
    invoiceId = await db.transaction(async (tx) => {
      const [target] = await tx.select({ invoiceId: payments.invoiceId }).from(payments).where(eq(payments.id, paymentId));
      if (!target) throw new InputError("Khoản thanh toán không còn tồn tại, tải lại trang.");
      const [invoice] = await lockInvoices(tx, [target.invoiceId]);
      if (!invoice || !inScope(viewer, invoice.faculty)) throw new InputError(MISSING);
      const [payment] = await tx
        .update(payments)
        .set({ voidedAt: new Date(), voidedByUserId: viewer.id, voidedByLabel: viewer.name, voidReason: reason })
        .where(and(eq(payments.id, paymentId), isNull(payments.voidedAt)))
        .returning({ amount: payments.amount, reference: payments.reference, paidAt: payments.paidAt });
      if (!payment) throw new InputError("Khoản này đã được hủy trước đó, tải lại trang.");
      const after = Math.max(0, invoice.total - invoice.paid + payment.amount);
      await notifyStudents(tx, [invoice.studentId], {
        kind: "system",
        title: `Khoản nộp học phí ${formatMoney(payment.amount)} được điều chỉnh`,
        body: `Phòng Kế hoạch - Tài chính hủy khoản ghi nhận ngày ${formatDate(payment.paidAt)} (mã ${payment.reference}) của ${invoice.termName}. Lý do: ${reason}. ${balanceText(after)}`,
        href: TUITION_HREF,
      });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "student",
        entityId: invoice.studentId,
        entityLabel: `${formatStudentCode(invoice.studentCode)} ${invoice.studentName}`,
        summary: `Hủy khoản ${formatMoney(payment.amount)} mã ${payment.reference} của học phí ${invoice.termName}. Lý do: ${reason}`,
        changes: [{ field: "Đã nộp", before: formatMoney(invoice.paid), after: formatMoney(invoice.paid - payment.amount) }],
      });
      return invoice.id;
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return reloadInvoice(invoiceId);
}

// Hóa đơn của các cặp MSSV + học kỳ xuất hiện trong sao kê, cùng mã giao dịch đã ghi, để đối chiếu.
async function reconcileContext(executor: Transaction | typeof db, lines: StatementLine[], viewer: Viewer) {
  const references = [...new Set(lines.map((line) => line.reference))];
  const codes = [...new Set(lines.flatMap((line) => parseTransferContent(line.content)?.studentCode ?? []))];
  const [recorded, invoices] = await Promise.all([
    references.length > 0
      ? executor
          .select({ reference: payments.reference })
          .from(payments)
          .where(and(inArray(payments.reference, references), isNull(payments.voidedAt)))
      : [],
    codes.length > 0
      ? executor
          .select({
            id: tuitionInvoices.id,
            studentCode: students.code,
            studentName: students.fullName,
            faculty: faculties.name,
            termName: terms.name,
            academicYear: terms.academicYear,
            semester: terms.semester,
            total: INVOICE_TOTAL_SQL,
            paid: INVOICE_PAID_SQL,
          })
          .from(tuitionInvoices)
          .innerJoin(students, eq(students.id, tuitionInvoices.studentId))
          .innerJoin(administrativeClasses, eq(administrativeClasses.id, students.administrativeClassId))
          .innerJoin(majors, eq(majors.id, administrativeClasses.majorId))
          .innerJoin(faculties, eq(faculties.id, majors.facultyId))
          .innerJoin(terms, eq(terms.id, tuitionInvoices.termId))
          .where(inArray(students.code, codes))
      : [],
  ]);
  const byKey = new Map<string, ReconcileInvoice>(
    invoices
      .filter((invoice) => inScope(viewer, invoice.faculty))
      .map((invoice) => [
        invoiceKey(invoice.studentCode, termKeyOf(invoice)),
        { invoiceId: invoice.id, balance: Math.max(0, invoice.total - invoice.paid), studentCode: formatStudentCode(invoice.studentCode), studentName: invoice.studentName, termName: invoice.termName },
      ]),
  );
  return { invoices: byKey, recorded: new Set(recorded.map((row) => row.reference)) };
}

async function statementRows(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return readSpreadsheet(new Uint8Array(await file.arrayBuffer()));
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  return null;
}

// Xem trước sao kê: đọc tệp, đối chiếu từng dòng với hóa đơn, chưa ghi gì. Cán bộ chọn dòng rồi gọi importStatement.
export async function previewStatement(formData: FormData): Promise<ActionResult<StatementPreview>> {
  const viewer = await requirePermission("tuition.manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return actionError("Chưa chọn tệp sao kê.");
  if (file.size > STATEMENT_MAX_BYTES) return actionError("Tệp lớn hơn 900 KB. Tách sao kê theo ngày rồi nhập lần lượt.");
  let rows: string[][] | null;
  try {
    rows = await statementRows(file);
  } catch {
    return actionError("Không đọc được tệp. Mở lại bằng Excel, lưu thành .xlsx hoặc CSV UTF-8 rồi chọn lại.");
  }
  if (!rows) return actionError("Chỉ nhận tệp .xlsx hoặc .csv.");
  const parsed = parseStatement(rows);
  if (typeof parsed === "string") return actionError(parsed);
  try {
    const context = await reconcileContext(db, parsed.lines, viewer);
    const matched = reconcileStatement(parsed.lines, context.invoices, context.recorded, new Date());
    return actionOk({ fileName: file.name, rows: [...matched, ...parsed.invalid].toSorted((a, b) => a.line - b.line), skipped: parsed.skipped });
  } catch (error) {
    return failure(error);
  }
}

// Ghi các dòng sao kê đã chọn. Đối chiếu lại trong transaction với dữ liệu mới nhất (không tin hóa đơn client gửi lên):
// dòng nào không còn khớp (đã có người ghi, số còn nợ đổi) thì không ghi gì cả để cán bộ xem trước lại.
export async function importStatement(input: StatementImportInput): Promise<ActionResult<{ recorded: number; students: number; total: number }>> {
  const viewer = await requirePermission("tuition.manage");
  const parsed = parseInput(STATEMENT_IMPORT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { fileName } = parsed.data;
  const lines = parsed.data.lines.toSorted((a, b) => a.line - b.line).map((line) => ({ ...line, paidAt: new Date(line.paidAt).toISOString() }));
  let summary: { recorded: number; students: number; total: number };
  try {
    summary = await db.transaction(async (tx) => {
      const first = await reconcileContext(tx, lines, viewer);
      const invoiceIds = [...new Set([...first.invoices.values()].map((invoice) => invoice.invoiceId))];
      const locked = await lockInvoices(tx, invoiceIds);
      // Đọc lại sau khi khóa: số đã nộp có thể vừa đổi bởi người khác.
      const context = await reconcileContext(tx, lines, viewer);
      const rows = reconcileStatement(lines, context.invoices, context.recorded, new Date());
      const rejected = rows.find((row) => !RECORDABLE_STATEMENT_STATUSES.includes(row.status));
      if (rejected) throw new InputError(`Dòng ${rejected.line}: ${rejected.message}. Dữ liệu đã thay đổi, chọn lại tệp để xem trước.`);
      const invoiceOf = new Map(locked.map((invoice) => [invoice.id, invoice]));
      await tx.insert(payments).values(
        rows.map((row) => ({
          invoiceId: row.invoiceId!,
          paidAt: new Date(row.paidAt!),
          amount: row.amount!,
          method: STATEMENT_METHOD,
          reference: row.reference,
          note: `Sao kê ${fileName}, dòng ${row.line}: ${row.content}`.slice(0, 300),
          source: "statement" as const,
          recordedByUserId: viewer.id,
          recordedByLabel: viewer.name,
        })),
      );
      const byInvoice = new Map<string, number>();
      for (const row of rows) byInvoice.set(row.invoiceId!, (byInvoice.get(row.invoiceId!) ?? 0) + row.amount!);
      const studentIds = [...new Set([...byInvoice.keys()].map((id) => invoiceOf.get(id)!.studentId))];
      const released = new Set(await releaseClearedTuitionHolds(tx, studentIds, viewer));
      // Tệp sao kê tới 2000 dòng: báo và ghi nhật ký gộp (một lệnh ghi mỗi loại) thay vì từng hóa đơn một.
      const cleared = studentIds.filter((id) => released.has(id));
      const others = studentIds.filter((id) => !released.has(id));
      await notifyStudents(tx, others, statementMessage(false));
      await notifyStudents(tx, cleared, statementMessage(true));
      const total = rows.reduce((sum, row) => sum + row.amount!, 0);
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "create",
        entityType: "tuition",
        entityId: fileName.slice(0, 200),
        entityLabel: `Sao kê ${fileName}`,
        summary: `Ghi nhận ${rows.length} khoản, ${formatMoney(total)} học phí của ${studentIds.length} sinh viên từ sao kê ${fileName}`,
        changes: [...byInvoice].slice(0, 200).map(([invoiceId, amount]) => {
          const invoice = invoiceOf.get(invoiceId)!;
          return { field: `${formatStudentCode(invoice.studentCode)} ${invoice.studentName}, ${invoice.termName}`, before: formatMoney(invoice.paid), after: formatMoney(invoice.paid + amount) };
        }),
      });
      return { recorded: rows.length, students: studentIds.length, total: rows.reduce((sum, row) => sum + row.amount!, 0) };
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return actionOk(summary);
}

// Chi tiết một hóa đơn cho ngăn kéo ở trang quản trị (lịch sử thanh toán gồm cả khoản đã hủy).
export async function loadInvoiceDetail(invoiceId: string): Promise<ActionResult<AdminInvoiceDetail>> {
  await requirePermission("tuition.manage");
  const invoice = await getAdminInvoice(invoiceId);
  return invoice ? actionOk(invoice) : actionError(MISSING);
}

const TUITION_AUDIT_LABEL = (invoice: { studentCode: string; studentName: string }) => `${formatStudentCode(invoice.studentCode)} ${invoice.studentName}`;

// Miễn giảm học phí (chính sách, học bổng, hoàn cảnh): số tiền trừ vào tổng phải nộp, bắt buộc ghi lý do, căn cứ; ghi nhật ký.
export async function setInvoiceDiscount(input: DiscountInput): Promise<ActionResult<AdminInvoiceDetail>> {
  const viewer = await requirePermission("tuition.manage");
  const parsed = parseInput(DISCOUNT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { invoiceId, amount, reason } = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [invoice] = await lockInvoices(tx, [invoiceId]);
      if (!invoice || !inScope(viewer, invoice.faculty)) throw new InputError(MISSING);
      const gross = invoice.total + invoice.discount;
      if (amount > gross) throw new InputError(`Miễn giảm không vượt tổng các khoản ${formatMoney(gross)}.`, "amount");
      await tx.update(tuitionInvoices).set({ discount: amount, discountReason: amount === 0 ? "" : reason }).where(eq(tuitionInvoices.id, invoiceId));
      await notifyStudents(tx, [invoice.studentId], {
        kind: "system",
        title: `Học phí ${invoice.termName}: ${amount > 0 ? `miễn giảm ${formatMoney(amount)}` : "bỏ miễn giảm"}`,
        body: `${amount > 0 ? `Lý do: ${reason}. ` : ""}${balanceText(Math.max(0, gross - amount - invoice.paid))}`,
        href: TUITION_HREF,
      });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "tuition",
        entityId: invoiceId,
        entityLabel: TUITION_AUDIT_LABEL(invoice),
        summary: `Miễn giảm học phí ${invoice.termName}${amount > 0 ? `: ${reason}` : ": bỏ miễn giảm"}`,
        changes: [{ field: "Miễn giảm", before: formatMoney(invoice.discount), after: formatMoney(amount) }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return reloadInvoice(invoiceId);
}

// Ghi nhận đã hoàn phần nộp thừa (hủy lớp, giảm tín chỉ sau khi đã nộp). Không chuyển tiền tự động; DB chặn hoàn vượt số nộp thừa.
export async function recordRefund(input: RefundInput): Promise<ActionResult<AdminInvoiceDetail>> {
  const viewer = await requirePermission("tuition.manage");
  const parsed = parseInput(REFUND_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  if (new Date(values.refundedAt).getTime() > Date.now() + 60_000) return actionError("Ngày hoàn không được sau hôm nay.", { refundedAt: "Ngày hoàn không được sau hôm nay" });
  try {
    await db.transaction(async (tx) => {
      const [invoice] = await lockInvoices(tx, [values.invoiceId]);
      if (!invoice || !inScope(viewer, invoice.faculty)) throw new InputError(MISSING);
      const overpaid = Math.max(0, invoice.paid - invoice.total);
      if (overpaid === 0) throw new InputError("Hóa đơn không có khoản nộp thừa để hoàn.");
      if (values.amount > overpaid) throw new InputError(`Số nộp thừa là ${formatMoney(overpaid)}, hoàn tối đa số này.`, "amount");
      await tx.insert(tuitionRefunds).values({
        invoiceId: invoice.id,
        amount: values.amount,
        refundedAt: new Date(values.refundedAt),
        method: values.method,
        reference: values.reference,
        note: values.note,
        recordedByUserId: viewer.id,
        recordedByLabel: viewer.name,
      });
      await notifyStudents(tx, [invoice.studentId], {
        kind: "system",
        title: `Đã hoàn ${formatMoney(values.amount)} học phí ${invoice.termName}`,
        body: `Phòng Kế hoạch - Tài chính đã hoàn phần nộp thừa ngày ${formatDate(values.refundedAt)} (${values.method}, chứng từ ${values.reference}).`,
        href: TUITION_HREF,
      });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "create",
        entityType: "tuition",
        entityId: invoice.id,
        entityLabel: TUITION_AUDIT_LABEL(invoice),
        summary: `Hoàn ${formatMoney(values.amount)} học phí nộp thừa ${invoice.termName}, chứng từ ${values.reference}`,
        changes: [{ field: "Đã nộp (trừ hoàn)", before: formatMoney(invoice.paid), after: formatMoney(invoice.paid - values.amount) }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return reloadInvoice(values.invoiceId);
}

// Đơn giá tín chỉ theo ngành, năm học: dữ liệu chung toàn trường. Hóa đơn tạm tính tính lại theo đơn giá mới ở lần đăng ký sau
// hoặc khi chốt; hóa đơn đã chốt giữ nguyên.
export async function saveTuitionRate(input: RateInput): Promise<ActionResult> {
  const viewer = await requireSchoolWidePermission("tuition.manage");
  const parsed = parseInput(RATE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [major] = await tx.select({ id: majors.id, name: majors.name }).from(majors).where(eq(majors.code, values.majorCode));
      if (!major) throw new InputError("Ngành không có trong danh mục", "majorCode");
      const [before] = await tx.select({ price: tuitionRates.pricePerCredit }).from(tuitionRates).where(and(eq(tuitionRates.academicYear, values.academicYear), eq(tuitionRates.majorId, major.id)));
      await tx
        .insert(tuitionRates)
        .values({ academicYear: values.academicYear, majorId: major.id, pricePerCredit: values.pricePerCredit, note: values.note })
        .onConflictDoUpdate({ target: [tuitionRates.academicYear, tuitionRates.majorId], set: { pricePerCredit: values.pricePerCredit, note: values.note } });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: before ? "update" : "create",
        entityType: "tuition",
        entityId: `rate:${values.academicYear}:${values.majorCode}`,
        entityLabel: `Đơn giá ${major.name} ${values.academicYear}-${values.academicYear + 1}`,
        summary: `Đơn giá tín chỉ ngành ${major.name}, năm học ${values.academicYear}-${values.academicYear + 1}`,
        changes: [{ field: "Đơn giá", before: before ? formatMoney(before.price) : "Chưa có", after: formatMoney(values.pricePerCredit) }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/tuition", "layout");
  return actionOk();
}

export async function saveTuitionFee(input: FeeInput): Promise<ActionResult> {
  const viewer = await requireSchoolWidePermission("tuition.manage");
  const parsed = parseInput(FEE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select({ amount: tuitionFees.amount }).from(tuitionFees).where(and(eq(tuitionFees.academicYear, values.academicYear), eq(tuitionFees.code, values.code)));
      await tx
        .insert(tuitionFees)
        .values(values)
        .onConflictDoUpdate({ target: [tuitionFees.academicYear, tuitionFees.code], set: { label: values.label, amount: values.amount, isMandatory: values.isMandatory } });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: before ? "update" : "create",
        entityType: "tuition",
        entityId: `fee:${values.academicYear}:${values.code}`,
        entityLabel: `${values.label} ${values.academicYear}-${values.academicYear + 1}`,
        summary: `Khoản thu ${values.label}, năm học ${values.academicYear}-${values.academicYear + 1}${values.isMandatory ? "" : " (không bắt buộc, không tự vào hóa đơn)"}`,
        changes: [{ field: "Số tiền", before: before ? formatMoney(before.amount) : "Chưa có", after: formatMoney(values.amount) }],
      });
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/administrator/tuition", "layout");
  return actionOk();
}

// Chốt học phí học kỳ: tính lại mọi hóa đơn tạm tính theo đăng ký hiện có (lập hóa đơn cho sinh viên chưa có), đặt hạn nộp chính thức
// và đổi thành chính thức. Sau khi chốt, thay đổi đăng ký thêm dòng điều chỉnh. Thường làm sau khi đợt điều chỉnh đóng.
export async function finalizeTermTuition(input: FinalizeInput): Promise<ActionResult<{ finalized: number; unpriced: number }>> {
  const viewer = await requireSchoolWidePermission("tuition.manage");
  const parsed = parseInput(FINALIZE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { termId, dueDate } = parsed.data;
  let result: { finalized: number; unpriced: number };
  try {
    result = await db.transaction(async (tx) => {
      const [term] = await tx.select({ id: terms.id, name: terms.name }).from(terms).where(eq(terms.id, termId));
      if (!term) throw new InputError("Học kỳ không còn tồn tại, tải lại trang.");
      const enrolled = await tx
        .selectDistinct({ studentId: enrollments.studentId })
        .from(enrollments)
        .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
        .where(and(eq(enrollments.termId, termId), eq(enrollments.status, "enrolled"), ne(classSections.status, "cancelled")));
      const billed = await tx.select({ studentId: tuitionInvoices.studentId }).from(tuitionInvoices).where(and(eq(tuitionInvoices.termId, termId), isNull(tuitionInvoices.finalizedAt)));
      const studentIds = [...new Set([...enrolled, ...billed].map((row) => row.studentId))];
      let unpriced = 0;
      for (const studentId of studentIds) {
        const sync = await syncTermInvoice(tx, studentId, termId);
        if (sync.change === "unpriced") unpriced += 1;
      }
      if (unpriced > 0) throw new InputError(`${unpriced} sinh viên thuộc ngành chưa có đơn giá tín chỉ năm học này. Nhập đơn giá trước khi chốt.`);
      const finalized = await tx
        .update(tuitionInvoices)
        .set({ finalizedAt: new Date(), finalizedByLabel: viewer.name, dueDate, issuedAt: new Date() })
        .where(and(eq(tuitionInvoices.termId, termId), isNull(tuitionInvoices.finalizedAt)))
        .returning({ studentId: tuitionInvoices.studentId });
      await notifyStudents(
        tx,
        finalized.map((row) => row.studentId),
        { kind: "deadline", title: `Học phí ${term.name} đã chốt`, body: `Học phí theo số tín chỉ đăng ký đã chốt, hạn nộp ${formatDate(dueDate)}. Quá hạn mà còn nợ thì bị khóa đăng ký học kỳ sau.`, href: TUITION_HREF },
      );
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "lock",
        entityType: "tuition",
        entityId: termId,
        entityLabel: `Học phí ${term.name}`,
        summary: `Chốt học phí ${term.name}: ${finalized.length} hóa đơn, hạn nộp ${formatDate(dueDate)}`,
      });
      return { finalized: finalized.length, unpriced };
    });
  } catch (error) {
    return failure(error);
  }
  revalidateTuition();
  return actionOk(result);
}
