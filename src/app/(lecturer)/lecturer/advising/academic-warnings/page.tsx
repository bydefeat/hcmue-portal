import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AcademicWarningTable } from "@/modules/grades/components/academic-warning-table";
import { WARNING_RULES } from "@/modules/grades/grades.constant";
import { getAcademicWarnings } from "@/modules/grades/grades.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Cảnh báo học vụ" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const advisees = await getAdvisees(lecturer.id);
  const warnings = await getAcademicWarnings(advisees.map((student) => student.id));

  return (
    <>
      <PageHeader
        title="Cảnh báo học vụ"
        description={`${warnings.length} sinh viên bị cảnh báo sau học kỳ 2, năm học 2025-2026. Gặp từng sinh viên và ghi nhận trên cổng.`}
      />
      <ul className="mb-4 flex flex-col gap-1 text-xs text-muted">
        {WARNING_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <AcademicWarningTable warnings={warnings} studentHrefBase="/lecturer/advising/students/" />
    </>
  );
}
