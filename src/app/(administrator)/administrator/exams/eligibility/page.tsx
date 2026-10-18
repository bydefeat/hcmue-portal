import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getClassRoster, getClassSections, getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { AdminExamEligibility, type EligibilityRow } from "@/modules/exams/components/admin-exam-eligibility";
import { getAttendanceBook } from "@/modules/schedule/schedule.query";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Điều kiện dự thi" };

export default async function Page() {
  const viewer = await requirePermission("exams.manage");
  const [term, regulation] = await Promise.all([getCurrentTerm(), getRegulation()]);
  const limit = regulation.attendance.absenceLimitPercent / 100;
  const sections = (await getClassSections(term.id)).filter((section) => section.status === "open" && inScope(viewer, section.faculty));

  const perSection = await Promise.all(
    sections.map(async (section) => {
      const roster = await getClassRoster(section.id);
      const book = await getAttendanceBook(section.id, roster.map((entry) => entry.studentId), section.meetings, term.startDate);
      const taken = book.sessions.filter((session) => session.isTaken);
      if (taken.length === 0) return [];
      return roster.flatMap((entry): EligibilityRow[] => {
        const absences = taken.filter((session) => {
          const status = book.records[session.id]?.[entry.studentId];
          return status === "absent" || status === "excused";
        }).length;
        const ratio = absences / taken.length;
        if (ratio < limit) return [];
        return [
          {
            key: `${section.id}-${entry.studentId}`,
            studentId: entry.studentId,
            studentCode: entry.studentCode,
            fullName: entry.fullName,
            className: entry.className,
            sectionCode: section.code,
            courseName: section.courseName,
            absences,
            sessions: taken.length,
            ratio,
            overrideReason: null,
          },
        ];
      });
    }),
  );
  const rows = perSection.flat();

  return (
    <>
      <PageHeader
        back={{ href: "/administrator/exams", label: "Lịch thi" }}
        title="Điều kiện dự thi"
        description={`Sinh viên vắng từ ${regulation.attendance.absenceLimitPercent}% số buổi đã học trở lên (gồm cả vắng có phép) bị cấm thi theo quy chế. ${rows.length} trường hợp trong ${sections.length} lớp.`}
      />
      <AdminExamEligibility rows={rows} limitPercent={regulation.attendance.absenceLimitPercent} />
    </>
  );
}
