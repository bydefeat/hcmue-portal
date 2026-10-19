import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { requirePermission } from "@/modules/access/access.query";
import { getFacultyNames } from "@/modules/curriculum/curriculum.query";
import { getCurrentTerm, getTerms } from "@/modules/course-registration/course-registration.query";
import { ReportExportCenter } from "@/modules/settings/components/report-export-center";
import { REPORT_DEFINITIONS } from "@/modules/settings/settings.constant";
import { getReportExports } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Xuất báo cáo" };

export default async function Page() {
  const viewer = await requirePermission("reports.view");
  const [terms, currentTerm, jobs, facultyNames] = await Promise.all([getTerms(), getCurrentTerm(), getReportExports(), getFacultyNames()]);
  const faculties = viewer.faculty ? [viewer.faculty] : facultyNames;

  return (
    <>
      <PageHeader title="Xuất báo cáo" description="Các báo cáo định kỳ theo mẫu. Tệp được tạo nền và lưu trong lịch sử xuất 30 ngày." />
      <ReportExportCenter
        reports={REPORT_DEFINITIONS}
        terms={terms.map((term) => ({ id: term.id, name: term.shortName }))}
        faculties={faculties}
        defaultTermId={currentTerm.id}
        jobs={jobs}
      />
    </>
  );
}
