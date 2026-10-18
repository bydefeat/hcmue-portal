import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { formatDate, daysUntil } from "@/shared/libs/date.lib";
import { LecturerClassList } from "@/modules/course-registration/components/lecturer-class-list";
import { getClassRoster, getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import { GRADE_SHEET_STATE } from "@/modules/grades/grades.constant";
import { getGradeSheetSummaries } from "@/modules/grades/grades.query";
import type { GradeSheetSummary } from "@/modules/grades/grades.type";
import { getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lớp học phần" };

function gradeNote(summary: GradeSheetSummary) {
  if (summary.state === "published") return "Sinh viên đã xem được điểm";
  if (summary.state === "approved") return "Chờ Phòng Đào tạo công bố";
  if (summary.state === "locked") return "Đã chốt, chờ khoa duyệt";
  if (summary.state === "returned") return "Khoa trả lại, sửa rồi chốt lại";
  const days = daysUntil(summary.deadline);
  const progress = `${summary.filledCells}/${summary.totalCells} ô`;
  if (summary.state === "overdue") return `Hạn ${formatDate(summary.deadline)} · ${progress}`;
  return `Còn ${days} ngày · ${progress}`;
}

export default async function Page() {
  const [lecturer, term] = await Promise.all([getCurrentLecturer(), getCurrentTerm()]);
  const sections = await getLecturerClassSections(lecturer.id, term.id);
  const rosters = await Promise.all(sections.map((section) => getClassRoster(section.id)));
  const summaries = await getGradeSheetSummaries(
    sections.map((section, index) => ({ classSectionId: section.id, studentIds: rosters[index].map((entry) => entry.studentId) })),
  );
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
