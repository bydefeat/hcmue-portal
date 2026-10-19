import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AcademicWarningTable } from "@/modules/grades/components/academic-warning-table";
import { AcademicWarningTerms } from "@/modules/grades/components/academic-warning-terms";
import { WARNING_RULES } from "@/modules/grades/grades.constant";
import { getAcademicWarnings, getWarningTerms } from "@/modules/grades/grades.query";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Cảnh báo học vụ" };

export default async function Page({ searchParams }: { searchParams: Promise<{ term?: string | string[] }> }) {
  const viewer = await requirePermission("reports.view");
  const [{ term }, terms] = await Promise.all([searchParams, getWarningTerms()]);
  const requested = terms.find((entry) => entry.id === term);
  // Mặc định là học kỳ có cảnh báo gần nhất; chưa có thì học kỳ xét được gần nhất.
  const selected = requested ?? terms.find((entry) => entry.warnings > 0) ?? terms[0] ?? null;
  const warnings = selected ? (await getAcademicWarnings(undefined, selected.id)).filter((warning) => inScope(viewer, warning.faculty)) : [];
  const pending = warnings.filter((warning) => warning.status === "new").length;

  return (
    <>
      <PageHeader
        title="Cảnh báo học vụ"
        description={
          selected
            ? `${selected.name}: ${warnings.length} sinh viên dưới ngưỡng, ${pending} trường hợp chưa gửi thông báo.`
            : "Chưa có học kỳ nào kết thúc để xét cảnh báo."
        }
        actions={<AcademicWarningTerms terms={terms} selectedId={selected?.id ?? null} canGenerate={can(viewer, "grades.publish") && viewer.faculty === null} />}
      />
      <ul className="mb-4 flex flex-col gap-1 text-xs text-muted">
        {WARNING_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <AcademicWarningTable key={selected?.id} warnings={warnings} studentHrefBase="/administrator/users/students/" showFaculty />
    </>
  );
}
