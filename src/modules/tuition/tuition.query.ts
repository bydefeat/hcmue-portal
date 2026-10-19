import { mockDelay } from "@/shared/libs/mock-request.lib";
import { invoiceView } from "@/modules/tuition/tuition.constant";
import { buildInvoice } from "@/modules/tuition/tuition.mock";
import type { CourseCharge } from "@/modules/tuition/tuition.type";

export async function getInvoices(params: {
  majorCode: string;
  terms: { termId: string; termName: string; courses: CourseCharge[]; isCurrent: boolean }[];
}) {
  await mockDelay();
  return params.terms
    .map((term, index) =>
      invoiceView(
        buildInvoice({ ...term, majorCode: params.majorCode, termIndex: index, includeInsurance: term.termName.startsWith("Học kỳ 1") }),
      ),
    )
    .reverse();
}
