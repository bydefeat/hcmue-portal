import type { Metadata } from "next";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { formatDateTime } from "@/shared/libs/date.lib";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getTerms } from "@/modules/course-registration/course-registration.query";
import { AdminSurveyResults } from "@/modules/surveys/components/admin-survey-results";
import { AdminSurveyRounds } from "@/modules/surveys/components/admin-survey-rounds";
import { LOW_SCORE } from "@/modules/surveys/surveys.constant";
import { getSurveyResults, getSurveys } from "@/modules/surveys/surveys.query";
import { responseRate, weightedOverall } from "@/modules/surveys/surveys.rule";
import type { Survey } from "@/modules/surveys/surveys.type";

export const metadata: Metadata = { title: "Khảo sát giảng dạy" };

function periodText(survey: Survey) {
  if (survey.status === "upcoming") return `Mở lúc ${formatDateTime(survey.opensAt)}, đóng lúc ${formatDateTime(survey.closesAt)}.`;
  if (survey.status === "open") return `Đang mở đến ${formatDateTime(survey.closesAt)}, kết quả cập nhật khi sinh viên gửi phiếu.`;
  return `Đã đóng lúc ${formatDateTime(survey.closesAt)}.${survey.isSealed ? " Giảng viên xem được kết quả lớp đủ số phiếu." : ""}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ survey?: string }> }) {
  const viewer = await requirePermission("surveys.view");
  const [{ survey: wanted }, surveys, terms] = await Promise.all([searchParams, getSurveys(), getTerms()]);
  // Mặc định: đợt đang mở, không có thì đợt mới nhất đã mở.
  const survey = surveys.find((entry) => entry.id === wanted) ?? surveys.find((entry) => entry.status === "open") ?? surveys.find((entry) => entry.status === "closed") ?? surveys[0] ?? null;
  const canManage = can(viewer, "surveys.manage");
  const all = survey ? await getSurveyResults(survey.id) : [];
  const results = all.filter((row) => inScope(viewer, row.faculty));
  const rate = responseRate(results);
  const withResponses = results.filter((row) => row.responses > 0);
  const overall = weightedOverall(withResponses);
  const low = withResponses.filter((row) => row.overall < LOW_SCORE).length;
  const termOptions = terms.filter((term) => term.isCurrent || term.startDate >= (terms.find((entry) => entry.isCurrent)?.startDate ?? "")).map((term) => ({ id: term.id, name: term.name }));

  return (
    <>
      <PageHeader title="Khảo sát giảng dạy" description={survey ? `${survey.title}, ${survey.termName}. ${periodText(survey)}` : "Chưa có đợt khảo sát nào."} />
      <AdminSurveyRounds surveys={surveys} selected={survey} terms={termOptions} canManage={canManage} />
      {!survey ? (
        <SectionCard flush>
          <EmptyState illustration="document" title="Chưa có đợt khảo sát" description={canManage ? "Tạo đợt khảo sát cho học kỳ hiện tại." : "Phòng Đào tạo chưa tạo đợt khảo sát nào."} />
        </SectionCard>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
            <StatTile label="Lớp được khảo sát" value={results.length} hint={`${withResponses.length} lớp đã có phiếu`} />
            <StatTile label="Tỉ lệ phản hồi" value={`${rate.percent}%`} hint={`${rate.responses}/${rate.enrolled} phiếu, tính cả lớp chưa có phiếu`} />
            <StatTile label="Điểm chung" value={overall.toFixed(2).replace(".", ",")} hint="Thang 5, theo số phiếu" />
            <StatTile
              label="Lớp cần cải thiện"
              value={low}
              tone={low > 0 ? "danger" : undefined}
              hint={low > 0 ? "Điểm chung dưới 3,5, cần khoa trao đổi với giảng viên" : "Không lớp nào có điểm chung dưới 3,5"}
            />
          </div>
          <AdminSurveyResults results={results} questions={survey.questions} />
        </>
      )}
    </>
  );
}
