import { z } from "zod";
import { normalizeSearch } from "@/shared/libs/search.lib";
import type { InvoiceLine, StatementLine, StatementPreviewRow, StatementStatus } from "@/modules/tuition/tuition.type";

// Khóa học kỳ dùng trong nội dung chuyển khoản ("HK1-2026"), giữ đúng dạng ngân hàng đã quen gạch nợ.
export function termKeyOf(term: { academicYear: number; semester: number }) {
  return `hk${term.semester}-${term.academicYear}`;
}

// Học phí tính theo tín chỉ đăng ký nhân đơn giá ngành; khoản thu cố định (bảo hiểm y tế) thu một lần vào học kỳ 1 của năm học.
// Dùng cả khi seed lẫn lúc chạy (hóa đơn tạm tính cập nhật sau mỗi lần đăng ký, hủy).
export function buildInvoiceLines(params: { credits: number; pricePerCredit: number; semester: number; fees: { label: string; amount: number }[] }): InvoiceLine[] {
  const { credits, pricePerCredit } = params;
  const tuition: InvoiceLine = {
    kind: "tuition",
    label: pricePerCredit === 0 ? "Học phí (sinh viên sư phạm được miễn theo Nghị định 116)" : `Học phí ${credits} tín chỉ`,
    quantity: credits,
    unitPrice: pricePerCredit,
    amount: credits * pricePerCredit,
  };
  const fees = params.semester === 1 ? params.fees.map((fee): InvoiceLine => ({ kind: "fee", label: fee.label, quantity: 1, unitPrice: fee.amount, amount: fee.amount })) : [];
  return [...(credits > 0 ? [tuition] : []), ...fees];
}

// Số tín chỉ đã tính tiền trên hóa đơn: dòng học phí cộng các dòng điều chỉnh (đơn giá âm là giảm tín chỉ).
export function billedCredits(lines: Pick<InvoiceLine, "kind" | "quantity" | "unitPrice">[]) {
  return lines.reduce((sum, line) => {
    if (line.kind === "tuition") return sum + line.quantity;
    if (line.kind === "adjustment") return sum + (line.unitPrice < 0 ? -line.quantity : line.quantity);
    return sum;
  }, 0);
}

// Hóa đơn đã chốt: đăng ký đổi thì thêm một dòng điều chỉnh bằng phần chênh tín chỉ, giữ nguyên các dòng đã chốt.
export function adjustmentLine(params: { creditDelta: number; pricePerCredit: number; note: string }): InvoiceLine | null {
  const { creditDelta, pricePerCredit, note } = params;
  if (creditDelta === 0 || pricePerCredit === 0) return null;
  const quantity = Math.abs(creditDelta);
  const unitPrice = creditDelta > 0 ? pricePerCredit : -pricePerCredit;
  return {
    kind: "adjustment",
    label: `Điều chỉnh sau chốt: ${creditDelta > 0 ? "thêm" : "giảm"} ${quantity} tín chỉ${note ? ` (${note})` : ""}`.slice(0, 300),
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
  };
}

// Khóa đăng ký do học phí tính từ hóa đơn của học kỳ hiện tại: chỉ hóa đơn đã chốt, còn nợ và qua hết ngày hạn nộp mới chặn;
// nộp đủ (ghi nhận khoản nộp hoặc sao kê) là hết chặn ngay. Còn nợ nhưng chưa tới hạn thì chỉ nhắc.
export function tuitionBlockOf(invoice: { balance: number; dueDate: string; isFinal: boolean; daysToDue: number } | null | undefined, termShortName: string) {
  if (!invoice || invoice.balance <= 0) return null;
  const amount = `${invoice.balance.toLocaleString("vi-VN")}\u00a0đ`;
  if (invoice.isFinal && invoice.daysToDue < 0) {
    return {
      blocking: true,
      reason: `Học phí ${termShortName} quá hạn, còn nợ ${amount}`,
      resolveHint: "Nộp đủ học phí học kỳ này. Khóa đăng ký tự gỡ ngay khi Phòng Kế hoạch - Tài chính ghi nhận khoản nộp.",
    };
  }
  return {
    blocking: false,
    reason: `Học phí ${termShortName} còn ${amount}${invoice.isFinal ? "" : " (tạm tính)"}`,
    resolveHint: invoice.isFinal ? "Nộp trước hạn. Quá hạn mà còn nợ thì bị khóa đăng ký học phần cho tới khi nộp đủ." : "Số tiền cập nhật theo đăng ký, chính thức sau khi chốt học phí học kỳ.",
  };
}

export const DISCOUNT_SCHEMA = z.object({
  invoiceId: z.uuid(),
  amount: z.int("Số tiền là số nguyên đồng").min(0, "Không âm").max(1_000_000_000),
  reason: z.string().trim().max(300, "Tối đa 300 ký tự"),
}).refine((input) => input.amount === 0 || input.reason.length >= 5, { path: ["reason"], message: "Ghi lý do, căn cứ miễn giảm (tối thiểu 5 ký tự)" });

export type DiscountInput = z.input<typeof DISCOUNT_SCHEMA>;

export const REFUND_SCHEMA = z.object({
  invoiceId: z.uuid(),
  amount: z.int("Số tiền là số nguyên đồng").min(1000, "Số tiền tối thiểu 1.000 đ").max(1_000_000_000),
  refundedAt: z.iso.datetime({ offset: true, message: "Chưa chọn ngày hoàn" }),
  method: z.string().trim().min(1, "Chưa ghi hình thức").max(80),
  reference: z.string().trim().min(3, "Nhập số chứng từ hoặc mã giao dịch").max(64),
  note: z.string().trim().max(300).default(""),
});

export type RefundInput = z.input<typeof REFUND_SCHEMA>;

export const RATE_SCHEMA = z.object({
  academicYear: z.int().min(2000).max(2100),
  majorCode: z.string().trim().min(1, "Chưa chọn ngành"),
  pricePerCredit: z.int("Đơn giá là số nguyên đồng").min(0).max(100_000_000),
  note: z.string().trim().max(300).default(""),
});

export type RateInput = z.input<typeof RATE_SCHEMA>;

export const FEE_SCHEMA = z.object({
  academicYear: z.int().min(2000).max(2100),
  code: z.string().trim().regex(/^[a-z0-9-]{2,30}$/, "Mã dạng chữ thường, số, gạch ngang"),
  label: z.string().trim().min(1, "Chưa nhập tên khoản thu").max(120),
  amount: z.int("Số tiền là số nguyên đồng").min(0).max(100_000_000),
  isMandatory: z.boolean().default(true),
});

export type FeeInput = z.input<typeof FEE_SCHEMA>;

export const FINALIZE_SCHEMA = z.object({ termId: z.uuid(), dueDate: z.iso.date("Chưa chọn hạn nộp") });

export type FinalizeInput = z.input<typeof FINALIZE_SCHEMA>;

export function invoiceTotal(lines: InvoiceLine[], discount: number) {
  return Math.max(0, lines.reduce((sum, line) => sum + line.amount, 0) - discount);
}

// Nội dung chuyển khoản dạng "HP 5001104009 HK1-2026" (transferContent). Ngân hàng hay viết hoa, bỏ dấu gạch hoặc chèn chữ
// trước sau ("NGUYEN VAN A HP 5001104009 HK1 2026"), nên chỉ tìm cụm HP + MSSV + HK<số>-<năm> ở bất kỳ đâu trong nội dung.
const TRANSFER_PATTERN = /HP[\s:._-]*(\d{2}[.\s]?\d{2}[.\s]?\d{3}[.\s]?\d{3})[\s,._-]*HK[\s._-]*([1-3])[\s._-]*(\d{4})/i;

export function parseTransferContent(content: string): { studentCode: string; termKey: string } | null {
  const match = TRANSFER_PATTERN.exec(content);
  if (!match) return null;
  return { studentCode: match[1].replace(/[.\s]/g, ""), termKey: `hk${match[2]}-${match[3]}` };
}

// Số tiền trong sao kê: "9.063.600", "9,063,600", "9063600", "9.063.600,00" hoặc ô số của Excel. Học phí tính theo đồng nên làm tròn.
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned) || cleaned.startsWith("-")) return null;
  let normalized: string;
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    normalized = `${cleaned.slice(0, decimalAt).replace(/[.,]/g, "")}.${cleaned.slice(decimalAt + 1)}`;
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/[.,]/g, "");
  } else {
    normalized = cleaned.replace(",", ".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : null;
}

// Ngày giao dịch "19/10/2026", "19/10/2026 10:15[:30]", "2026-10-19[ T]10:15[:30]"; giờ ghi trên sao kê là giờ Việt Nam.
export function parseStatementDate(text: string): string | null {
  const value = text.trim();
  const vn = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(value);
  const parts = vn ? [vn[3], vn[2], vn[1], vn[4], vn[5], vn[6]] : iso ? iso.slice(1, 7) : null;
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.map((part) => (part ?? "0").padStart(2, "0"));
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  // Date tự lăn 31/02 sang tháng sau: so lại ngày tháng theo giờ Việt Nam để bắt ngày không có thật.
  const local = new Date(date.getTime() + 7 * 3600_000);
  if (local.getUTCDate() !== Number(day) || local.getUTCMonth() + 1 !== Number(month)) return null;
  return date.toISOString();
}

// Tên cột sao kê của các ngân hàng (đã bỏ dấu, chữ thường). Cột số tiền ưu tiên "ghi có" để không lấy nhầm cột ghi nợ.
const STATEMENT_HEADERS = {
  paidAt: ["ngay giao dich", "ngay gd", "thoi gian giao dich", "thoi gian", "ngay hach toan", "ngay", "transaction date", "date"],
  reference: ["ma giao dich", "so tham chieu", "ma tham chieu", "so giao dich", "ma gd", "so ct", "so chung tu", "reference", "ref"],
  amount: ["so tien ghi co", "ghi co", "so tien co", "credit", "so tien"],
  content: ["noi dung chuyen khoan", "noi dung", "dien giai", "mo ta", "chi tiet", "description"],
} as const;

type StatementField = keyof typeof STATEMENT_HEADERS;

function headerKey(cell: string) {
  return normalizeSearch(cell)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findStatementColumns(header: string[]): Record<StatementField, number> | null {
  const keys = header.map(headerKey);
  const columns = {} as Record<StatementField, number>;
  for (const field of Object.keys(STATEMENT_HEADERS) as StatementField[]) {
    const index = STATEMENT_HEADERS[field].map((name) => keys.indexOf(name)).find((found) => found >= 0);
    if (index === undefined) return null;
    columns[field] = index;
  }
  return new Set(Object.values(columns)).size === 4 ? columns : null;
}

export const STATEMENT_MAX_LINES = 2000;

export type ParsedStatement = { lines: StatementLine[]; invalid: StatementPreviewRow[]; skipped: number };

function invalidRow(line: number, cells: { reference: string; content: string }, message: string): StatementPreviewRow {
  return {
    line,
    paidAt: null,
    reference: cells.reference,
    amount: null,
    content: cells.content,
    status: "invalid",
    message,
    invoiceId: null,
    studentCode: null,
    studentName: null,
    termName: null,
    balance: null,
  };
}

// Tìm dòng tiêu đề trong 15 dòng đầu (sao kê thường có vài dòng tên ngân hàng, số tài khoản phía trên), rồi đọc từng dòng bên dưới.
// Dòng không có số tiền ghi có (khoản chi) bỏ qua, không tính là lỗi.
export function parseStatement(rows: string[][]): ParsedStatement | string {
  const headerIndex = rows.slice(0, 15).findIndex((row) => findStatementColumns(row) !== null);
  if (headerIndex < 0) return "Không thấy dòng tiêu đề có đủ các cột Ngày giao dịch, Mã giao dịch, Số tiền ghi có, Nội dung.";
  const columns = findStatementColumns(rows[headerIndex])!;
  const body = rows.slice(headerIndex + 1);
  if (body.length > STATEMENT_MAX_LINES) return `Tệp có ${body.length} dòng, mỗi lần nhập tối đa ${STATEMENT_MAX_LINES} dòng. Tách tệp theo ngày rồi nhập lần lượt.`;
  const parsed: ParsedStatement = { lines: [], invalid: [], skipped: 0 };
  body.forEach((cells, index) => {
    const line = headerIndex + index + 2;
    const cell = (column: number) => cells[column]?.trim() ?? "";
    const raw = { paidAt: cell(columns.paidAt), reference: cell(columns.reference), amountText: cell(columns.amount), content: cell(columns.content).slice(0, 500) };
    if (raw.amountText === "" || raw.amountText === "0") {
      parsed.skipped++;
      return;
    }
    const amount = parseMoney(raw.amountText);
    const paidAt = parseStatementDate(raw.paidAt);
    if (amount === null || amount <= 0) parsed.invalid.push(invalidRow(line, raw, `Số tiền "${raw.amountText}" không đọc được`));
    else if (!paidAt) parsed.invalid.push(invalidRow(line, raw, `Ngày giao dịch "${raw.paidAt}" không đọc được, dùng dạng 19/10/2026 10:15`));
    else if (!raw.reference) parsed.invalid.push(invalidRow(line, raw, "Thiếu mã giao dịch của ngân hàng"));
    else if (raw.reference.length > 64) parsed.invalid.push(invalidRow(line, raw, "Mã giao dịch dài quá 64 ký tự"));
    else parsed.lines.push({ line, paidAt, reference: raw.reference.toUpperCase(), amount, content: raw.content });
  });
  return parsed;
}

export type ReconcileInvoice = { invoiceId: string; balance: number; studentCode: string; studentName: string; termName: string };

export function invoiceKey(studentCode: string, termKey: string) {
  return `${studentCode}|${termKey.toLowerCase()}`;
}

function money(value: number) {
  return `${value.toLocaleString("vi-VN")} đ`;
}

// Đối chiếu từng dòng sao kê với hóa đơn theo thứ tự trong tệp: dòng trước đã trừ vào số còn nợ thì dòng sau tính trên phần còn lại,
// nên hai lần chuyển cho cùng một hóa đơn không cùng được coi là khớp đủ.
export function reconcileStatement(lines: StatementLine[], invoices: Map<string, ReconcileInvoice>, recordedReferences: Set<string>, now: Date): StatementPreviewRow[] {
  const remaining = new Map<string, number>();
  const seen = new Set<string>();
  return lines.map((line) => {
    const base: StatementPreviewRow = { ...line, status: "unmatched", message: "", invoiceId: null, studentCode: null, studentName: null, termName: null, balance: null };
    const reference = line.reference.trim().toUpperCase();
    if (recordedReferences.has(reference)) return { ...base, status: "duplicate", message: "Mã giao dịch đã được ghi nhận trước đó" };
    if (seen.has(reference)) return { ...base, status: "duplicate", message: "Mã giao dịch lặp lại trong tệp" };
    seen.add(reference);
    if (new Date(line.paidAt).getTime() > now.getTime() + 60_000) return { ...base, status: "invalid", message: "Ngày giao dịch sau thời điểm hiện tại" };
    const parsed = parseTransferContent(line.content);
    if (!parsed) return { ...base, message: "Nội dung không theo mẫu HP <MSSV> HK<học kỳ>-<năm>" };
    const invoice = invoices.get(invoiceKey(parsed.studentCode, parsed.termKey));
    if (!invoice) return { ...base, studentCode: parsed.studentCode, message: `Không có hóa đơn của MSSV ${parsed.studentCode} học kỳ ${parsed.termKey.toUpperCase()}` };
    const balance = remaining.get(invoice.invoiceId) ?? invoice.balance;
    const matched = { ...base, invoiceId: invoice.invoiceId, studentCode: invoice.studentCode, studentName: invoice.studentName, termName: invoice.termName, balance };
    if (balance <= 0) return { ...matched, status: "over", message: "Hóa đơn đã nộp đủ, khoản này cần hoàn trả cho sinh viên" };
    if (line.amount > balance) return { ...matched, status: "over", message: `Chuyển thừa ${money(line.amount - balance)} so với số còn nợ, không ghi tự động` };
    remaining.set(invoice.invoiceId, balance - line.amount);
    if (line.amount < balance) return { ...matched, status: "partial", message: `Ít hơn số còn nợ, sau khoản này còn thiếu ${money(balance - line.amount)}` };
    return { ...matched, status: "matched", message: "Khớp đủ số còn nợ" };
  });
}

// Dòng ghi được vào sổ: khớp đủ, hoặc nộp thiếu mà cán bộ đã chọn.
export const RECORDABLE_STATEMENT_STATUSES: StatementStatus[] = ["matched", "partial"];

export const PAYMENT_METHODS = ["Chuyển khoản ngân hàng", "Nộp tiền mặt tại Phòng Kế hoạch - Tài chính", "Quẹt thẻ tại Phòng Kế hoạch - Tài chính", "Thanh toán qua ứng dụng ngân hàng"];

export const STATEMENT_METHOD = "Chuyển khoản (nhập sao kê)";

export const PAYMENT_SCHEMA = z.object({
  invoiceId: z.uuid("Chưa chọn hóa đơn"),
  amount: z.int("Số tiền là số nguyên đồng").min(1000, "Số tiền tối thiểu 1.000 đ").max(1_000_000_000, "Số tiền quá lớn"),
  paidAt: z.iso.datetime({ offset: true, message: "Chưa chọn ngày nộp" }),
  method: z.string().trim().min(1, "Chưa chọn hình thức").max(80),
  reference: z
    .string()
    .trim()
    .min(3, "Nhập mã giao dịch hoặc số biên lai")
    .max(64, "Mã tham chiếu tối đa 64 ký tự")
    .transform((value) => value.toUpperCase()),
  note: z.string().trim().max(300, "Ghi chú tối đa 300 ký tự").default(""),
});

export type PaymentInput = z.input<typeof PAYMENT_SCHEMA>;

export const VOID_PAYMENT_SCHEMA = z.object({
  paymentId: z.uuid("Khoản thanh toán không hợp lệ"),
  reason: z.string().trim().min(5, "Ghi lý do hủy, tối thiểu 5 ký tự").max(300, "Lý do tối đa 300 ký tự"),
});

export type VoidPaymentInput = z.input<typeof VOID_PAYMENT_SCHEMA>;

export const STATEMENT_IMPORT_SCHEMA = z.object({
  fileName: z.string().trim().min(1).max(200),
  lines: z
    .array(
      z.object({
        line: z.int().min(1),
        paidAt: z.iso.datetime({ offset: true }),
        reference: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .transform((value) => value.toUpperCase()),
        amount: z.int().min(1).max(1_000_000_000),
        content: z.string().max(500),
      }),
    )
    .min(1, "Chưa chọn dòng nào để ghi")
    .max(STATEMENT_MAX_LINES),
});

export type StatementImportInput = z.input<typeof STATEMENT_IMPORT_SCHEMA>;
