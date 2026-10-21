import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { RegistrationPeriodList } from "@/modules/course-registration/components/registration-period-list";
import { TermList } from "@/modules/course-registration/components/term-list";
import { getRegistrationPeriods, getTermOverview } from "@/modules/course-registration/course-registration.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCohorts } from "@/modules/users/users.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Học kỳ và đợt đăng ký" };

export default async function Page() {
  const viewer = await requirePermission("registration.manage");
  const [terms, periods, cohorts, regulation] = await Promise.all([getTermOverview(), getRegistrationPeriods(), getCohorts(), getRegulation()]);
  const canManage = viewer.faculty === null;

  return (
    <>
      <PageHeader
        title="Học kỳ và đợt đăng ký"
        description={`Mỗi đợt quy định khóa được đăng ký, thời gian mở và hạn mức tín chỉ (để trống là theo quy chế). Đợt còn dưới ${regulation.workflow.registrationClosingSoonHours} giờ được đánh dấu sắp đóng.`}
      />
      <div className="flex flex-col gap-4 sm:gap-6">
        <SectionCard title="Học kỳ" flush>
          <TermList terms={terms} canManage={canManage} />
        </SectionCard>
        <RegistrationPeriodList
          terms={terms.filter((term) => periods.some((period) => period.termId === term.id) || term.isCurrent || term.isRegistrationTarget)}
          periods={periods}
          cohorts={cohorts}
          regulationCredits={regulation.credits}
          canManage={canManage}
        />
      </div>
    </>
  );
}
