export type InvoiceStatus = "paid" | "unpaid" | "overdue" | "partial";

export type InvoiceLineKind = "tuition" | "fee" | "adjustment";

export type InvoiceLine = {
  kind: InvoiceLineKind;
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
  termKey: string;
  termName: string;
  issuedAt: string;
  dueDate: string;
  lines: InvoiceLine[];
  discount: number;
  discountReason: string;
  total: number;
  paid: number;
  refunded: number;
  payments: Payment[];
  isFinal: boolean;
};

export type TuitionInvoiceView = TuitionInvoice & {
  status: InvoiceStatus;
  balance: number;
  refundDue: number;
  daysToDue: number;
};

export type CourseCharge = {
  code: string;
  name: string;
  credits: number;
};

export type PaymentSource = "bank-sync" | "statement" | "manual";

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

export type Refund = {
  id: string;
  amount: number;
  refundedAt: string;
  method: string;
  reference: string;
  note: string;
  recordedBy: string;
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
  refundDue: number;
  status: InvoiceStatus;
  daysToDue: number;
  isFinal: boolean;
};

export type AdminInvoiceDetail = AdminInvoiceRow & {
  lines: InvoiceLine[];
  discount: number;
  discountReason: string;
  payments: PaymentRecord[];
  refunds: Refund[];
};

export type TuitionRateRow = {
  id: string;
  academicYear: number;
  majorCode: string;
  majorName: string;
  pricePerCredit: number;
  note: string;
};

export type TuitionFeeRow = {
  id: string;
  academicYear: number;
  code: string;
  label: string;
  amount: number;
  isMandatory: boolean;
};

export type TermTuitionStatus = {
  termId: string;
  termName: string;
  invoices: number;
  provisional: number;
  finalizedAt: string | null;
};

export type StatementLine = {
  line: number;
  paidAt: string;
  reference: string;
  amount: number;
  content: string;
};

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
  skipped: number;
};
