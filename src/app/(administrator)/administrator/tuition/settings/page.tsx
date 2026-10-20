import type { Metadata } from "next";
import { requirePermission } from "@/modules/access/access.query";
import { getMajors } from "@/modules/curriculum/curriculum.query";
import { TuitionSettings } from "@/modules/tuition/components/tuition-settings";
import { getTermTuitionStatus, getTuitionFees, getTuitionRates } from "@/modules/tuition/tuition.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Đơn giá và chốt học phí" };

export default async function Page() {
  const viewer = await requirePermission("tuition.manage");
  const [rates, fees, terms, majors] = await Promise.all([getTuitionRates(), getTuitionFees(), getTermTuitionStatus(), getMajors()]);
  return (
    <>
      <PageHeader
        title="Đơn giá và chốt học phí"
        description="Đơn giá tín chỉ theo ngành và năm học, khoản thu cố định, chốt học phí từng học kỳ."
        back={{ href: "/administrator/tuition", label: "Học phí" }}
      />
      <TuitionSettings rates={rates} fees={fees} terms={terms} majors={majors.map(({ code, name }) => ({ code, name }))} canManage={viewer.faculty === null} />
    </>
  );
}
