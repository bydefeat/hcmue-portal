import type { StatusMeta } from "@/shared/constants/status.constant";
import { daysUntil } from "@/shared/libs/date.lib";
import type { InvoiceStatus, TuitionInvoice, TuitionInvoiceView } from "@/modules/tuition/tuition.type";
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
  const daysToDue = daysUntil(invoice.dueDate);
  let status: InvoiceStatus = "paid";
  if (balance > 0) status = daysToDue < 0 ? "overdue" : invoice.paid > 0 ? "partial" : "unpaid";
  return { ...invoice, balance, daysToDue, status };
}

// "HP 5001104009 HK1-2026": MSSV 10 chữ số liền và khóa học kỳ, để ngân hàng tự gạch nợ.
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
  tuition_rates_academic_year_major_id_unique: "Ngành đã có đơn giá trong năm học này.",
  tuition_rates_price_non_negative: "Đơn giá tín chỉ không được âm.",
  tuition_fees_academic_year_code_unique: "Năm học đã có khoản thu cùng mã.",
  tuition_fees_amount_non_negative: "Khoản thu không được âm.",
};
