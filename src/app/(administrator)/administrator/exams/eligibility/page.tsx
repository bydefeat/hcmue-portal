import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { AdminExamEligibility } from "@/modules/exams/components/admin-exam-eligibility";
import { getExamClassOptions, getExamDeferrals, getExamEligibility } from "@/modules/exams/exams.query";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Điều kiện dự thi" };

export default async function Page() {
  const viewer = await requirePermission("exams.manage");
  const [term, regulation] = await Promise.all([getCurrentTerm(), getRegulation()]);
  const limit = regulation.attendance.absenceLimitPercent;
  const [classes, all, deferrals] = await Promise.all([getExamClassOptions(term.id), getExamEligibility(term.id, limit), getExamDeferrals(term.id)]);
  const ownClasses = classes.filter((entry) => inScope(viewer, entry.faculty));
  const rows = all.filter((row) => inScope(viewer, row.faculty));

  return (
    <>
      <PageHeader
        back={{ href: "/administrator/exams", label: "Lịch thi" }}
        title="Điều kiện dự thi"
        description={`Sinh viên vắng quá ${limit}% tổng số tiết của học phần (gồm cả vắng có phép) bị cấm thi theo quy chế. ${rows.length} trường hợp trong ${ownClasses.length} lớp.`}
      />
      <AdminExamEligibility rows={rows} deferrals={deferrals.filter((row) => inScope(viewer, row.faculty))} classes={ownClasses} limitPercent={limit} />
    </>
  );
}
