import type { StatusMeta } from "@/shared/constants/status.constant";
import { daysUntil } from "@/shared/libs/date.lib";
import type { InvoiceStatus, TuitionInvoice, TuitionInvoiceView } from "@/modules/tuition/tuition.type";

export const PRICE_PER_CREDIT: Record<string, number> = {
  "104": 520_000,
  "751": 495_000,
  "611": 470_000,
};

export const TEACHER_TRAINING_PRICE = 0;

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

export function transferContent(studentCode: string, termId: string) {
  return `HP ${studentCode} ${termId.toUpperCase()}`;
}
