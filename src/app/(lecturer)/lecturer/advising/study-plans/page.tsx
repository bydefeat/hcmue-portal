import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StudyPlanReview } from "@/modules/study-plan/components/study-plan-review";
import { getStudyPlans } from "@/modules/study-plan/study-plan.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Kế hoạch học tập" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const advisees = await getAdvisees(lecturer.id);
  const plans = await getStudyPlans(advisees.map((student) => student.id));
  const pending = plans.filter((plan) => plan.status === "pending").length;

  return (
    <>
      <PageHeader
        title="Kế hoạch học tập"
        description={`${pending} kế hoạch chờ duyệt. Duyệt trong vòng 5 ngày để sinh viên kịp đăng ký học phần.`}
      />
      <StudyPlanReview plans={plans} />
    </>
  );
}
