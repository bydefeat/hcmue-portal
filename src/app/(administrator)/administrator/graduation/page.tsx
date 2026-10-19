import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { requirePermission } from "@/modules/access/access.query";
import { GraduationReview } from "@/modules/graduation/components/graduation-review";
import { GRADUATING_COHORT } from "@/modules/graduation/graduation.constant";
import { getGraduationCandidates } from "@/modules/graduation/graduation.query";

export const metadata: Metadata = { title: "Xét tốt nghiệp" };

export default async function Page() {
  await requirePermission("graduation.manage");
  const candidates = await getGraduationCandidates();
  const count = (status: string) => candidates.filter((candidate) => candidate.status === status).length;

  return (
    <>
      <PageHeader
        title="Xét tốt nghiệp"
        description={`Đợt tháng 12, khóa ${GRADUATING_COHORT}. Hệ thống tự kiểm tra tín chỉ, CPA, nợ học phần, chuẩn đầu ra ngoại ngữ và tin học, học phí, kỷ luật. Mở từng dòng để xem chi tiết.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
        <StatTile label="Sinh viên được xét" value={candidates.length} hint={`Khóa ${GRADUATING_COHORT}`} />
        <StatTile label="Đủ điều kiện" value={count("eligible")} hint="Chờ trình hội đồng" />
        <StatTile label="Chưa đủ điều kiện" value={count("missing")} tone={count("missing") > 0 ? "warning" : undefined} hint="Thiếu ít nhất một điều kiện" />
        <StatTile label="Đã tốt nghiệp" value={count("graduated")} hint="Các đợt trước" />
      </div>
      <GraduationReview candidates={candidates} />
    </>
  );
}
