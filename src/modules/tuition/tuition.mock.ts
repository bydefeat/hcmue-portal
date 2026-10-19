import { dayjs } from "@/shared/libs/date.lib";
import { createRandom, mockDate, mockId } from "@/shared/libs/mock.lib";
import { invoiceTotal } from "@/modules/tuition/tuition.rule";
import type { InvoiceLine } from "@/modules/tuition/tuition.type";

export const HEALTH_INSURANCE = { code: "bhyt", label: "Bảo hiểm y tế 12 tháng", amount: 1_263_600 };

// Năm học có đơn giá và khoản thu trong dữ liệu mẫu (bảng điểm từ 2022 đến học kỳ hiện tại).
export const TUITION_YEARS = [2022, 2023, 2024, 2025, 2026];

// Hóa đơn mẫu của một sinh viên trong một học kỳ. Học kỳ cũ đã nộp đủ; học kỳ hiện tại phát hành 25 ngày trước, hạn sau 9 ngày,
// sinh viên đang đăng nhập chưa nộp (để thấy hướng dẫn chuyển khoản), các bạn khác nộp đủ, nộp thiếu hoặc chưa nộp.
export function mockInvoice(params: {
  studentId: string;
  studentIndex: number;
  isCurrentStudent: boolean;
  term: { id: string; academicYear: number; semester: number; startDate: string };
  isCurrent: boolean;
  lines: InvoiceLine[];
}) {
  const { studentId, studentIndex, term, isCurrent, lines } = params;
  const id = mockId(`invoice:${studentId}:${term.id}`);
  const issuedAt = isCurrent ? mockDate(-25, "08:00") : dayjs(term.startDate).add(14, "day").hour(8).toISOString();
  const dueDate = isCurrent ? dayjs(mockDate(9)).format("YYYY-MM-DD") : dayjs(issuedAt).add(30, "day").format("YYYY-MM-DD");
  const total = invoiceTotal(lines, 0);
  const random = createRandom(studentIndex * 53 + term.academicYear * 3 + term.semester);
  const roll = random();
  let paid = total;
  if (isCurrent) paid = params.isCurrentStudent || roll >= 0.65 ? 0 : roll < 0.55 ? total : Math.round(total / 2 / 1000) * 1000;
  const paidAt = isCurrent ? dayjs(issuedAt).add(3 + Math.floor(random() * 18), "day").hour(10) : dayjs(issuedAt).add(9 + (studentIndex % 7), "day").hour(14);
  return {
    invoice: { id, studentId, termId: term.id, issuedAt: new Date(issuedAt), dueDate, discount: 0 },
    lines: lines.map((line, position) => ({ invoiceId: id, position: position + 1, label: line.label, quantity: line.quantity, unitPrice: line.unitPrice })),
    payments:
      paid > 0
        ? [
            {
              id: mockId(`payment:${id}:1`),
              invoiceId: id,
              paidAt: paidAt.toDate(),
              amount: paid,
              method: (studentIndex + term.semester) % 2 === 0 ? "Chuyển khoản BIDV" : "Thanh toán qua ứng dụng ngân hàng",
              reference: `FT${term.academicYear % 100}${term.semester}${String(studentIndex).padStart(4, "0")}${String(Math.floor(random() * 1000)).padStart(3, "0")}`,
            },
          ]
        : [],
  };
}
