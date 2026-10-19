import type { Metadata } from "next";
import { can } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { TuitionAdmin } from "@/modules/tuition/components/tuition-admin";
import { getAdminInvoices, getInvoiceTerms } from "@/modules/tuition/tuition.query";

export const metadata: Metadata = { title: "Học phí" };

export default async function Page({ searchParams }: { searchParams: Promise<{ term?: string; q?: string }> }) {
  const viewer = await requirePermission("tuition.manage");
  const [{ term, q }, terms] = await Promise.all([searchParams, getInvoiceTerms()]);
  const termId = term === "all" || terms.some((entry) => entry.id === term) ? term! : (terms.find((entry) => entry.isCurrent) ?? terms[0])?.id ?? "all";
  const invoices = await getAdminInvoices(termId);

  return (
    <TuitionAdmin
      key={termId}
      invoices={invoices}
      terms={terms}
      termId={termId}
      initialQuery={q}
      studentHrefBase={can(viewer, "students.view") ? "/administrator/users/students/" : null}
    />
  );
}
