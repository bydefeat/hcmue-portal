import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getClassSections, getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { AdminExamEligibility } from "@/modules/exams/components/admin-exam-eligibility";
import { getExamEligibility } from "@/modules/exams/exams.query";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Điều kiện dự thi" };

export default async function Page() {
  const viewer = await requirePermission("exams.manage");
  const [term, regulation] = await Promise.all([getCurrentTerm(), getRegulation()]);
  const limit = regulation.attendance.absenceLimitPercent;
  const [sections, all] = await Promise.all([getClassSections(term.id), getExamEligibility(term.id, limit)]);
  const sectionCount = sections.filter((section) => section.status === "open" && inScope(viewer, section.faculty)).length;
  const rows = all.filter((row) => inScope(viewer, row.faculty));

  return (
    <>
      <PageHeader
        back={{ href: "/administrator/exams", label: "Lịch thi" }}
        title="Điều kiện dự thi"
        description={`Sinh viên vắng từ ${limit}% số buổi đã học trở lên (gồm cả vắng có phép) bị cấm thi theo quy chế. ${rows.length} trường hợp trong ${sectionCount} lớp.`}
      />
      <AdminExamEligibility rows={rows} limitPercent={limit} />
    </>
  );
}
