import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { TeachingAssignmentBoard } from "@/modules/course-registration/components/teaching-assignment-board";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import { getLecturers } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Phân công giảng dạy" };

export default async function Page({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const viewer = await requirePermission("teaching.assign");
  const [{ term }, currentTerm, targetTerm, lecturers] = await Promise.all([searchParams, getCurrentTerm(), getRegistrationTargetTerm(), getLecturers()]);
  const termId = term === currentTerm.id ? currentTerm.id : targetTerm.id;
  const sections = (await getClassSections(termId)).filter((section) => inScope(viewer, section.faculty));

  return (
    <>
      <PageHeader
        title="Phân công giảng dạy"
        description="Giờ chuẩn quy đổi = số tiết x 15 tuần x hệ số sĩ số (trên 50 sinh viên 1,15, trên 80 sinh viên 1,3). Định mức mỗi học kỳ 135 giờ, giáo sư và phó giáo sư 120 giờ."
      />
      <TeachingAssignmentBoard
        key={termId}
        sections={sections}
        lecturers={lecturers
          .filter((lecturer) => inScope(viewer, lecturer.faculty))
          .map(({ id, displayName, title, faculty, status }) => ({ id, displayName, title, faculty, status }))}
        terms={[
          { id: targetTerm.id, name: `${targetTerm.shortName}, đang xếp lớp` },
          { id: currentTerm.id, name: `${currentTerm.shortName}, đang dạy` },
        ]}
        termId={termId}
      />
    </>
  );
}
