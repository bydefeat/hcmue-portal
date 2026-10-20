import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer } from "@/modules/access/access.query";
import { getClassSections, getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { GradePublishingTable, type PublishingRow } from "@/modules/grades/components/grade-publishing-table";
import { getGradeSheets } from "@/modules/grades/grades.query";
import { isPassing, letterOf, weightedScore } from "@/modules/grades/grades.rule";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Duyệt và công bố điểm" };

export default async function Page() {
  // Khoa duyệt (grades.approve) hoặc Phòng Đào tạo công bố (grades.publish): có một trong hai quyền là vào được, nút theo quyền.
  const viewer = await getViewer();
  if (!can(viewer, "grades.approve") && !can(viewer, "grades.publish")) forbidden();
  const [term, regulation] = await Promise.all([getCurrentTerm(), getRegulation()]);
  const sections = (await getClassSections(term.id)).filter((section) => section.status !== "cancelled" && inScope(viewer, section.faculty));
  const sheets = await getGradeSheets(sections.map((section) => section.id));
  const sheetOf = new Map(sheets.map((sheet) => [sheet.classSectionId, sheet]));
  const rows: PublishingRow[] = sections
    .filter((section) => sheetOf.has(section.id))
    .map((section) => {
      const sheet = sheetOf.get(section.id)!;
      const values = Object.values(sheet.scores);
      const cells = values.flatMap((row) => Object.values(row));
      const totals = values.map((row) => weightedScore(sheet.components, row, sheet.grading.roundingStep)).filter((value) => value !== null);
      const grades = totals.map((total) => letterOf(total, sheet.grading.scale));
      const letterCounts: Record<string, number> = {};
      for (const { letter } of grades) letterCounts[letter] = (letterCounts[letter] ?? 0) + 1;
      return {
        classSectionId: section.id,
        code: section.code,
        courseName: section.courseName,
        faculty: section.faculty,
        lecturerName: section.lecturerName,
        state: sheet.state,
        deadline: sheet.deadline,
        filledCells: cells.filter((value) => value !== null).length,
        totalCells: cells.length,
        studentCount: values.length,
        letterCounts,
        average: totals.length > 0 ? Math.round((totals.reduce((sum, value) => sum + value, 0) / totals.length) * 10) / 10 : null,
        passRate: grades.length > 0 ? Math.round((grades.filter((grade) => isPassing(grade)).length / grades.length) * 100) : null,
        returnReason: sheet.state === "returned" ? sheet.returnReason : null,
      };
    });
  const count = (state: PublishingRow["state"]) => rows.filter((row) => row.state === state).length;

  return (
    <>
      <PageHeader
        title="Duyệt và công bố điểm"
        description={`${term.name}. Giảng viên chốt điểm, khoa duyệt, Phòng Đào tạo công bố. Điểm chỉ hiện với sinh viên sau khi công bố.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4">
        <StatTile label="Chờ khoa duyệt" value={count("locked")} tone={count("locked") > 0 ? "warning" : undefined} hint="Giảng viên đã chốt" />
        <StatTile label="Chờ công bố" value={count("approved")} hint="Khoa đã duyệt" />
        <StatTile label="Quá hạn nhập" value={count("overdue")} tone={count("overdue") > 0 ? "danger" : undefined} hint="Giảng viên chưa chốt" />
        <StatTile label="Đã công bố" value={count("published")} hint={`Trên ${rows.length} lớp`} />
      </div>
      <GradePublishingTable rows={rows} letters={regulation.grading.scale.map((step) => step.letter)} canApprove={can(viewer, "grades.approve")} canPublish={can(viewer, "grades.publish")} />
    </>
  );
}
