import type { InvoiceLine } from "@/modules/tuition/tuition.type";

// Khóa học kỳ dùng trong nội dung chuyển khoản ("HK1-2026"), giữ đúng dạng ngân hàng đã quen gạch nợ.
export function termKeyOf(term: { academicYear: number; semester: number }) {
  return `hk${term.semester}-${term.academicYear}`;
}

// Học phí tính theo tín chỉ đăng ký nhân đơn giá ngành; khoản thu cố định (bảo hiểm y tế) thu một lần vào học kỳ 1 của năm học.
export function buildInvoiceLines(params: { credits: number; pricePerCredit: number; semester: number; fees: { label: string; amount: number }[] }): InvoiceLine[] {
  const { credits, pricePerCredit } = params;
  const tuition: InvoiceLine = {
    label: pricePerCredit === 0 ? "Học phí (sinh viên sư phạm được miễn theo Nghị định 116)" : `Học phí ${credits} tín chỉ`,
    quantity: credits,
    unitPrice: pricePerCredit,
    amount: credits * pricePerCredit,
  };
  const fees = params.semester === 1 ? params.fees.map((fee) => ({ label: fee.label, quantity: 1, unitPrice: fee.amount, amount: fee.amount })) : [];
  return [...(credits > 0 ? [tuition] : []), ...fees];
}

export function invoiceTotal(lines: InvoiceLine[], discount: number) {
  return Math.max(0, lines.reduce((sum, line) => sum + line.amount, 0) - discount);
}
