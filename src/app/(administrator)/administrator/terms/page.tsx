import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { RegistrationPeriodList } from "@/modules/course-registration/components/registration-period-list";
import { TermList } from "@/modules/course-registration/components/term-list";
import { getClassSections, getRegistrationPeriods, getTerms } from "@/modules/course-registration/course-registration.query";
import { getCohorts } from "@/modules/users/users.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Học kỳ và đợt đăng ký" };

export default async function Page() {
  await requirePermission("registration.manage");
  const [terms, periods, cohorts] = await Promise.all([getTerms(), getRegistrationPeriods(), getCohorts()]);
  const sectionCounts = await Promise.all(terms.map(async (term) => (await getClassSections(term.id)).length));
  const termRows = terms.map((term, index) => ({
    ...term,
    sectionCount: sectionCounts[index],
    periodCount: periods.filter((period) => period.termId === term.id).length,
  }));

  return (
    <>
      <PageHeader
        title="Học kỳ và đợt đăng ký"
        description="Mỗi đợt quy định khóa được đăng ký, thời gian mở và hạn mức tín chỉ. Đợt còn dưới 48 giờ được đánh dấu sắp đóng."
      />
      <div className="flex flex-col gap-4 sm:gap-6">
        <SectionCard title="Học kỳ" flush>
          <TermList terms={termRows} />
        </SectionCard>
        <RegistrationPeriodList terms={terms.filter((term) => periods.some((period) => period.termId === term.id) || term.isCurrent || term.isRegistrationTarget)} periods={periods} cohorts={cohorts} />
      </div>
    </>
  );
}
