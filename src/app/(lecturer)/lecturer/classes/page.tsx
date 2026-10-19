import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { formatDate, daysUntil } from "@/shared/libs/date.lib";
import { LecturerClassList } from "@/modules/course-registration/components/lecturer-class-list";
import { getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import { GRADE_SHEET_STATE } from "@/modules/grades/grades.constant";
import { getGradeSheetSummaries } from "@/modules/grades/grades.query";
import type { GradeSheetSummary } from "@/modules/grades/grades.type";
import { getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lớp học phần" };

function gradeNote(summary: GradeSheetSummary) {
  if (summary.state === "published") return "Sinh viên đã xem được điểm";
  if (summary.state === "approved") return "Chờ Phòng Đào tạo công bố";
  if (summary.state === "locked") return "Không sửa được trong lúc chờ duyệt";
  if (summary.state === "returned") return "Khoa trả lại, sửa rồi chốt lại";
  const days = daysUntil(summary.deadline);
  const progress = `${summary.filledCells}/${summary.totalCells} điểm đã nhập`;
  if (summary.state === "overdue") return `Hạn ${formatDate(summary.deadline)} · ${progress}`;
  return `Còn ${days} ngày · ${progress}`;
}

export default async function Page() {
  const [lecturer, term] = await Promise.all([getCurrentLecturer(), getCurrentTerm()]);
  const sections = await getLecturerClassSections(lecturer.id, term.id);
  const summaries = await getGradeSheetSummaries(sections.map((section) => section.id));
  const items = sections.map((section, index) => ({
    section,
    gradeStatus: GRADE_SHEET_STATE[summaries[index].state],
    gradeNote: gradeNote(summaries[index]),
  }));
  const students = sections.reduce((sum, section) => sum + section.enrolled, 0);

  return (
    <>
      <PageHeader title="Lớp học phần" description={`${term.name} · ${sections.length} lớp, ${students} sinh viên`} />
      <LecturerClassList items={items} />
    </>
  );
}
