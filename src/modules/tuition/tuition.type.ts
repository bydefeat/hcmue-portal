export type InvoiceStatus = "paid" | "unpaid" | "overdue" | "partial";

export type InvoiceLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type Payment = {
  id: string;
  paidAt: string;
  amount: number;
  method: string;
  reference: string;
};

export type TuitionInvoice = {
  id: string;
  termId: string;
  // "hk1-2026": dùng trong nội dung chuyển khoản.
  termKey: string;
  termName: string;
  issuedAt: string;
  dueDate: string;
  lines: InvoiceLine[];
  discount: number;
  total: number;
  paid: number;
  payments: Payment[];
};

export type TuitionInvoiceView = TuitionInvoice & {
  status: InvoiceStatus;
  balance: number;
  daysToDue: number;
};

export type CourseCharge = {
  code: string;
  name: string;
  credits: number;
};

export type PaymentSource = "bank-sync" | "statement" | "manual";

// Khoản thanh toán như cán bộ thấy: kèm nguồn, người ghi và thông tin hủy nếu ghi nhầm.
export type PaymentRecord = Payment & {
  invoiceId: string;
  source: PaymentSource;
  note: string;
  recordedBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
};

export type AdminInvoiceRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  className: string;
  faculty: string;
  termId: string;
  termName: string;
  termKey: string;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  daysToDue: number;
};

export type AdminInvoiceDetail = AdminInvoiceRow & {
  lines: InvoiceLine[];
  discount: number;
  payments: PaymentRecord[];
};

export type StatementLine = {
  // Số dòng trong tệp (dòng tiêu đề tính là một dòng) để cán bộ tìm lại trong Excel.
  line: number;
  paidAt: string;
  reference: string;
  amount: number;
  content: string;
};

// matched: khớp hóa đơn và đúng số còn nợ; partial: khớp nhưng ít hơn số còn nợ (ghi được khi cán bộ chọn);
// over: nhiều hơn số còn nợ (không ghi, xử lý hoàn tiền); duplicate: mã giao dịch đã ghi hoặc lặp trong tệp;
// unmatched: nội dung không ra hóa đơn nào; invalid: dòng thiếu hoặc sai dữ liệu.
export type StatementStatus = "matched" | "partial" | "over" | "duplicate" | "unmatched" | "invalid";

export type StatementPreviewRow = {
  line: number;
  paidAt: string | null;
  reference: string;
  amount: number | null;
  content: string;
  status: StatementStatus;
  message: string;
  invoiceId: string | null;
  studentCode: string | null;
  studentName: string | null;
  termName: string | null;
  balance: number | null;
};

export type StatementPreview = {
  fileName: string;
  rows: StatementPreviewRow[];
  // Dòng không có số tiền ghi có (khoản chi, số dư) được bỏ qua.
  skipped: number;
};
