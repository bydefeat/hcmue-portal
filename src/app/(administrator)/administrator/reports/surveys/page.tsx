import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { formatDate } from "@/shared/libs/date.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { AdminSurveyResults, LOW_SCORE } from "@/modules/surveys/components/admin-survey-results";
import { getSurvey, getSurveyResults } from "@/modules/surveys/surveys.query";

export const metadata: Metadata = { title: "Khảo sát giảng dạy" };

export default async function Page() {
  const viewer = await requirePermission("surveys.view");
  const [survey, all] = await Promise.all([getSurvey(), getSurveyResults()]);
  const results = all.filter((row) => inScope(viewer, row.faculty));
  const responses = results.reduce((sum, row) => sum + row.responses, 0);
  const enrolled = results.reduce((sum, row) => sum + row.enrolled, 0);
  const overall = responses > 0 ? results.reduce((sum, row) => sum + row.overall * row.responses, 0) / responses : 0;
  const low = results.filter((row) => row.overall < LOW_SCORE).length;

  return (
    <>
      <PageHeader title="Khảo sát giảng dạy" description={`${survey.title}. Đang mở đến ${formatDate(survey.closesAt)}, kết quả cập nhật khi sinh viên gửi phiếu.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
        <StatTile label="Lớp được khảo sát" value={results.length} />
        <StatTile label="Tỉ lệ phản hồi" value={`${enrolled > 0 ? Math.round((responses / enrolled) * 100) : 0}%`} hint={`${responses}/${enrolled} phiếu`} />
        <StatTile label="Điểm chung toàn trường" value={overall.toFixed(2).replace(".", ",")} hint="Thang 5" />
        <StatTile
          label="Lớp cần cải thiện"
          value={low}
          tone={low > 0 ? "danger" : undefined}
          hint={low > 0 ? "Điểm chung dưới 3,5, cần khoa trao đổi với giảng viên" : "Không lớp nào có điểm chung dưới 3,5"}
        />
      </div>
      <AdminSurveyResults results={results} questions={survey.questions} />
    </>
  );
}
