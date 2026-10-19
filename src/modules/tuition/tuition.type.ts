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
