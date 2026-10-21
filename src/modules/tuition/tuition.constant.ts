import type { StatusMeta } from "@/shared/constants/status.constant";
import { daysUntil } from "@/shared/libs/date.lib";
import type { InvoiceStatus, PaymentSource, StatementStatus, TuitionInvoice, TuitionInvoiceView } from "@/modules/tuition/tuition.type";
import { normalizeStudentCode } from "@/shared/libs/student-code.lib";

export const PRICE_PER_CREDIT: Record<string, number> = {
  "104": 520_000,
  "751": 495_000,
  "611": 470_000,
};

export const INVOICE_STATUS: Record<InvoiceStatus, StatusMeta> = {
  paid: { label: "Đã nộp đủ", tone: "success" },
  unpaid: { label: "Chưa nộp", tone: "warning" },
  partial: { label: "Nộp thiếu", tone: "warning" },
  overdue: { label: "Quá hạn", tone: "danger" },
};

export const PAYMENT_SOURCE_LABEL: Record<PaymentSource, string> = {
  "bank-sync": "Ngân hàng tự gạch nợ",
  statement: "Nhập sao kê",
  manual: "Ghi tay",
};

export const STATEMENT_STATUS: Record<StatementStatus, StatusMeta> = {
  matched: { label: "Khớp", tone: "success" },
  partial: { label: "Nộp thiếu", tone: "warning" },
  over: { label: "Lệch số tiền", tone: "danger" },
  duplicate: { label: "Trùng mã", tone: "neutral" },
  unmatched: { label: "Không khớp", tone: "warning" },
  invalid: { label: "Lỗi dữ liệu", tone: "danger" },
};

export const BANK_ACCOUNT = {
  bank: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV), chi nhánh Sài Gòn",
  accountName: "Trường Đại học Sư phạm Thành phố Hồ Chí Minh",
  accountNumber: "3101 0000 6688 99",
};

export function formatMoney(value: number) {
  return `${value.toLocaleString("vi-VN")} đ`;
}

export function invoiceView(invoice: TuitionInvoice): TuitionInvoiceView {
  const balance = Math.max(0, invoice.total - invoice.paid);
  const refundDue = Math.max(0, invoice.paid - invoice.total);
  const daysToDue = daysUntil(invoice.dueDate);
  let status: InvoiceStatus = "paid";
  if (balance > 0) status = invoice.isFinal && daysToDue < 0 ? "overdue" : invoice.paid > 0 ? "partial" : "unpaid";
  return { ...invoice, balance, refundDue, daysToDue, status };
}

export const PROVISIONAL_INVOICE: StatusMeta = { label: "Tạm tính", tone: "neutral" };

export function transferContent(studentCode: string, termKey: string) {
  return `HP ${normalizeStudentCode(studentCode)} ${termKey.toUpperCase()}`;
}

export const TUITION_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  tuition_invoices_student_id_term_id_unique: "Sinh viên đã có hóa đơn học phí của học kỳ này.",
  tuition_invoices_discount_non_negative: "Số tiền miễn giảm không được âm.",
  invoice_lines_invoice_id_position_unique: "Trùng thứ tự dòng trong hóa đơn.",
  invoice_lines_quantity_positive: "Số lượng trên hóa đơn phải lớn hơn 0.",
  invoice_lines_unit_price_non_negative: "Đơn giá không được âm.",
  payments_reference_unique: "Mã giao dịch đã được ghi nhận trước đó.",
  payments_amount_positive: "Số tiền thanh toán phải lớn hơn 0.",
  payments_reference_not_blank: "Chưa nhập mã giao dịch hoặc số biên lai.",
  payments_void_fields: "Hủy thanh toán phải có lý do và người hủy.",
  payments_within_invoice_total: "Số tiền vượt số còn nợ của hóa đơn. Ghi đúng số còn nợ, phần thừa làm thủ tục hoàn trả.",
  tuition_refunds_within_overpaid: "Số hoàn vượt số sinh viên đã nộp thừa.",
  tuition_refunds_amount_positive: "Số tiền hoàn phải lớn hơn 0.",
  tuition_refunds_reference_not_blank: "Chưa nhập số chứng từ hoàn tiền.",
  tuition_invoices_discount_reason: "Miễn giảm phải ghi lý do, căn cứ.",
  tuition_invoices_finalized_fields: "Hóa đơn chốt phải ghi người chốt.",
  tuition_rates_academic_year_major_id_unique: "Ngành đã có đơn giá trong năm học này.",
  tuition_rates_price_non_negative: "Đơn giá tín chỉ không được âm.",
  tuition_fees_academic_year_code_unique: "Năm học đã có khoản thu cùng mã.",
  tuition_fees_amount_non_negative: "Khoản thu không được âm.",
};
