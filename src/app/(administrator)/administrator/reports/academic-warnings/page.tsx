import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AcademicWarningTable } from "@/modules/grades/components/academic-warning-table";
import { WARNING_RULES } from "@/modules/grades/grades.constant";
import { getAcademicWarnings } from "@/modules/grades/grades.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Cảnh báo học vụ" };

export default async function Page() {
  const viewer = await requirePermission("reports.view");
  const warnings = (await getAcademicWarnings()).filter((warning) => inScope(viewer, warning.faculty));
  const pending = warnings.filter((warning) => warning.status === "new").length;

  return (
    <>
      <PageHeader
        title="Cảnh báo học vụ"
        description={`Học kỳ 2, năm học 2025-2026: ${warnings.length} sinh viên dưới ngưỡng, ${pending} trường hợp chưa gửi thông báo.`}
      />
      <ul className="mb-4 flex flex-col gap-1 text-xs text-muted">
        {WARNING_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <AcademicWarningTable warnings={warnings} studentHrefBase="/administrator/users/students/" showFaculty />
    </>
  );
}
