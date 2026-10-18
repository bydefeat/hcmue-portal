import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { RegistrationPeriodList } from "@/modules/course-registration/components/registration-period-list";
import { TermList } from "@/modules/course-registration/components/term-list";
import { getClassSections, getRegistrationPeriods, getTerms } from "@/modules/course-registration/course-registration.query";

export const metadata: Metadata = { title: "Học kỳ và đợt đăng ký" };

export default async function Page() {
  const [terms, periods] = await Promise.all([getTerms(), getRegistrationPeriods()]);
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
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Học kỳ</h2>
          <TermList terms={termRows} />
        </section>
        <RegistrationPeriodList terms={terms.filter((term) => periods.some((period) => period.termId === term.id) || term.isCurrent || term.isRegistrationTarget)} periods={periods} />
      </div>
    </>
  );
}
