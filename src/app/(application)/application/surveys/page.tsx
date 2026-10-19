import type { Metadata } from "next";
import { StudentSurveyList } from "@/modules/surveys/components/student-survey-list";
import { getStudentSurveyTasks, getSurvey } from "@/modules/surveys/surveys.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Khảo sát giảng dạy" };

export default async function Page() {
  const survey = await getSurvey();
  const tasks = survey ? await getStudentSurveyTasks(survey.id) : [];

  return (
    <>
      <PageHeader title="Khảo sát giảng dạy" description="Ý kiến của bạn giúp khoa cải thiện chất lượng giảng dạy. Mỗi lớp chỉ đánh giá một lần." />
      {survey ? (
        <StudentSurveyList survey={survey} tasks={tasks} />
      ) : (
        <SectionCard flush>
          <EmptyState illustration="document" title="Chưa có đợt khảo sát" description="Phòng Đào tạo chưa mở khảo sát giảng dạy cho học kỳ này." />
        </SectionCard>
      )}
    </>
  );
}
