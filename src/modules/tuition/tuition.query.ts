import { mockDelay } from "@/shared/libs/mock-request.lib";
import { invoiceView } from "./tuition.constant";
import { buildInvoice } from "./tuition.mock";
import type { CourseCharge } from "./tuition.type";

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
