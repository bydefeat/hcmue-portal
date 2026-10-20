import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AcademicWarningTable } from "@/modules/grades/components/academic-warning-table";
import { getAcademicWarnings } from "@/modules/grades/grades.query";
import { warningRules } from "@/modules/grades/grades.rule";
import { getRegulation } from "@/modules/settings/settings.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Cảnh báo học vụ" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const advisees = await getAdvisees(lecturer.id);
  const [warnings, regulation] = await Promise.all([getAcademicWarnings(advisees.map((student) => student.id)), getRegulation()]);
  const termName = warnings[0]?.termName.toLowerCase() ?? "học kỳ gần nhất";

  return (
    <>
      <PageHeader
        title="Cảnh báo học vụ"
        description={`${warnings.length} sinh viên bị cảnh báo sau ${termName}. Gặp từng sinh viên và ghi nhận trên cổng.`}
      />
      <ul className="mb-4 flex flex-col gap-1 text-xs text-muted">
        {warningRules(regulation.warning).map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <AcademicWarningTable warnings={warnings} studentHrefBase="/lecturer/advising/students/" />
    </>
  );
}
