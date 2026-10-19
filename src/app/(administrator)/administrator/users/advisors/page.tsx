import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AdvisorAssignmentTable } from "@/modules/users/components/advisor-assignment-table";
import { getAdvisorAssignments, getLecturers } from "@/modules/users/users.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Phân công cố vấn" };

export default async function Page() {
  const viewer = await requirePermission("advisors.assign");
  const [allAssignments, lecturers] = await Promise.all([getAdvisorAssignments(), getLecturers()]);
  const assignments = allAssignments.filter((assignment) => inScope(viewer, assignment.faculty));
  const faculties = [...new Set(assignments.map((assignment) => assignment.faculty))].toSorted((a, b) => a.localeCompare(b, "vi"));
  const cohorts = [...new Set(assignments.map((assignment) => assignment.cohort))].toSorted((a, b) => a - b);
  const unassigned = assignments.filter((assignment) => !assignment.advisorId).length;

  return (
    <>
      <PageHeader
        title="Phân công cố vấn học tập"
        description={
          unassigned > 0
            ? `${unassigned} lớp chưa có cố vấn, sinh viên các lớp này chưa nộp được kế hoạch học tập. Chỉ giảng viên cùng khoa mới được chọn.`
            : "Mọi lớp sinh hoạt đều đã có cố vấn. Chỉ giảng viên cùng khoa mới được chọn."
        }
      />
      <AdvisorAssignmentTable
        assignments={assignments}
        lecturers={lecturers.map(({ id, displayName, faculty, status }) => ({ id, displayName, faculty, status }))}
        faculties={faculties}
        cohorts={cohorts}
      />
    </>
  );
}
