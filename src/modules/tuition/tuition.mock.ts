import { dayjs } from "@/shared/libs/date.lib";
import { mockDate } from "@/shared/libs/mock.lib";
import { PRICE_PER_CREDIT, TEACHER_TRAINING_PRICE } from "@/modules/tuition/tuition.constant";
import type { CourseCharge, TuitionInvoice } from "@/modules/tuition/tuition.type";

const HEALTH_INSURANCE = 1_263_600;

export function buildInvoice(params: {
  termId: string;
  termName: string;
  majorCode: string;
  courses: CourseCharge[];
  isCurrent: boolean;
  termIndex: number;
  includeInsurance: boolean;
}): TuitionInvoice {
  const unitPrice = PRICE_PER_CREDIT[params.majorCode] ?? TEACHER_TRAINING_PRICE;
  const credits = params.courses.reduce((sum, course) => sum + course.credits, 0);
  const lines = [
    { label: unitPrice === 0 ? "Học phí (sinh viên sư phạm được miễn theo Nghị định 116)" : `Học phí ${credits} tín chỉ`, quantity: credits, unitPrice, amount: credits * unitPrice },
    ...(params.includeInsurance ? [{ label: "Bảo hiểm y tế 12 tháng", quantity: 1, unitPrice: HEALTH_INSURANCE, amount: HEALTH_INSURANCE }] : []),
  ];
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const issuedAt = params.isCurrent ? mockDate(-25, "08:00") : dayjs("2024-09-20").add(params.termIndex * 5, "month").toISOString();
  const dueDate = params.isCurrent ? mockDate(9, "17:00") : dayjs(issuedAt).add(30, "day").toISOString();
  const paid = params.isCurrent ? 0 : total;
  return {
    id: `hp-${params.termId}`,
    termId: params.termId,
    termName: params.termName,
    issuedAt,
    dueDate,
    lines,
    discount: 0,
    total,
    paid,
    payments: paid
      ? [
          {
            id: `gd-${params.termId}`,
            paidAt: dayjs(issuedAt).add(9 + params.termIndex, "day").toISOString(),
            amount: paid,
            method: params.termIndex % 2 === 0 ? "Chuyển khoản BIDV" : "Thanh toán qua ứng dụng ngân hàng",
            reference: `FT${String(24_000_000 + params.termIndex * 137_911).slice(0, 8)}`,
          },
        ]
      : [],
  };
}
