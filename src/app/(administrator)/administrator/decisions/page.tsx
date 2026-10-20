import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer } from "@/modules/access/access.query";
import { DecisionTable } from "@/modules/users/components/decision-table";
import { getAdvisorAssignments, getDecisions, getStudents } from "@/modules/users/users.query";
import { getMajors } from "@/modules/curriculum/curriculum.query";

export const metadata: Metadata = { title: "Quyết định sinh viên" };

// Người lập (decisions.manage) và người ký (decisions.sign) cùng làm việc trên trang này, mỗi người thấy nút của phần việc mình.
export default async function Page() {
  const viewer = await getViewer();
  const canManage = can(viewer, "decisions.manage");
  const canSign = can(viewer, "decisions.sign");
  if (!canManage && !canSign) forbidden();
  const [decisions, students, classes, majors] = await Promise.all([getDecisions(), getStudents(), getAdvisorAssignments(), getMajors()]);
  const scoped = decisions.filter((decision) => inScope(viewer, decision.faculty));
  const pending = scoped.filter((decision) => decision.status === "pending-signature").length;
  const majorCodeOf = new Map(majors.map((major) => [major.name, major.code]));

  return (
    <DecisionTable
      header={{
        title: "Quyết định sinh viên",
        description: `Bảo lưu, thôi học, chuyển ngành, khen thưởng, kỷ luật và tốt nghiệp. Quy trình: dự thảo, trình ký, đã ký; người lập không tự ký.${pending > 0 ? ` ${pending} quyết định đang chờ ký.` : ""}`,
      }}
      decisions={scoped}
      students={students
        .filter((student) => inScope(viewer, student.faculty))
        .map(({ id, code, fullName, className, faculty, majorCode, cohort, status }) => ({ id, code, fullName, className, faculty, majorCode, cohort, status }))}
      classes={classes
        .filter((entry) => inScope(viewer, entry.faculty))
        .map((entry) => ({ code: entry.className, majorCode: majorCodeOf.get(entry.majorName) ?? "", majorName: entry.majorName, cohort: entry.cohort }))}
      canManage={canManage}
      canSign={canSign}
      currentUserId={viewer.id}
    />
  );
}
