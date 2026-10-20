import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { requirePermission } from "@/modules/access/access.query";
import { GraduationReview } from "@/modules/graduation/components/graduation-review";
import { GraduationRoundForm } from "@/modules/graduation/components/graduation-round-form";
import { getGraduationCandidates, getGraduationCohortOptions } from "@/modules/graduation/graduation.query";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Xét tốt nghiệp" };

export default async function Page() {
  const viewer = await requirePermission("graduation.manage");
  const [{ round, candidates }, cohorts, regulation] = await Promise.all([getGraduationCandidates(), getGraduationCohortOptions(), getRegulation()]);
  const count = (status: string) => candidates.filter((candidate) => candidate.status === status).length;
  const downgraded = candidates.filter((candidate) => candidate.downgradeReasons.length > 0).length;
  const rules = regulation.graduation;

  return (
    <>
      <PageHeader
        title="Xét tốt nghiệp"
        description={
          round
            ? `${round.name.charAt(0).toUpperCase()}${round.name.slice(1)}, khóa ${round.cohorts.join(", ")}. Đối chiếu tín chỉ và học phần bắt buộc theo khung chương trình của từng khóa, CPA và nợ theo lần học cuối, chuẩn ngoại ngữ ${rules.languageMinLevel}${rules.requireItCertificate ? ", chuẩn tin học" : ""}, học phí và kỷ luật. Hạng tốt nghiệp giảm một mức khi học lại quá ${String(rules.retakeLimitPercent).replace(".", ",")}% tín chỉ hoặc bị kỷ luật theo quy chế ${regulation.version}.`
            : "Chưa mở đợt xét tốt nghiệp. Mở đợt và chọn các khóa được xét để hệ thống lập danh sách."
        }
        actions={<GraduationRoundForm round={round} cohorts={cohorts} canManage={viewer.faculty === null} />}
      />
      {round ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
            <StatTile label="Sinh viên được xét" value={candidates.length} hint={`Khóa ${round.cohorts.join(", ")}`} />
            <StatTile label="Đủ điều kiện" value={count("eligible")} hint="Chờ trình hội đồng" />
            <StatTile label="Chưa đủ điều kiện" value={count("missing")} tone={count("missing") > 0 ? "warning" : undefined} hint="Thiếu ít nhất một điều kiện" />
            <StatTile label="Bị giảm hạng" value={downgraded} hint={`Đã tốt nghiệp ${count("graduated")}`} />
          </div>
          <GraduationReview candidates={candidates} />
        </>
      ) : (
        <EmptyState illustration="document" title="Chưa có đợt xét tốt nghiệp đang mở" description="Cán bộ Phòng Đào tạo mở đợt và chọn khóa được xét ở nút Mở đợt xét." />
      )}
    </>
  );
}
