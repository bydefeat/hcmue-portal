import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { standingLabel, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getCurrentWarnings, getStudentStandings } from "@/modules/grades/grades.query";
import { STUDY_PLAN_STATUS } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlans } from "@/modules/study-plan/study-plan.query";
import { AdviseeTable, type AdviseeRow } from "@/modules/users/components/advisee-table";
import { getAdvisedClasses, getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Sinh viên cố vấn" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const [advisees, classes] = await Promise.all([getAdvisees(lecturer.id), getAdvisedClasses(lecturer.id)]);
  const ids = advisees.map((student) => student.id);
  const [standings, plans, warnings] = await Promise.all([getStudentStandings(ids), getStudyPlans(ids), getCurrentWarnings(ids)]);
  const standingById = new Map(standings.map((standing) => [standing.studentId, standing]));
  const planById = new Map(plans.map((plan) => [plan.studentId, plan]));

  const rows: AdviseeRow[] = advisees.map((student) => {
    const standing = standingById.get(student.id)!;
    const plan = planById.get(student.id);
    const warning = warnings[student.id];
    return {
      student,
      cpa4: standing.cpa4,
      earnedCredits: standing.earnedCredits,
      standingLabel: standingLabel(standing.standing),
      warning: warning ? WARNING_LEVEL[warning.level] : null,
      plan: plan ? STUDY_PLAN_STATUS[plan.status] : null,
      needsAttention: warning !== undefined || standing.warningLevel > 0 || plan?.status === "pending",
    };
  });
  const attention = rows.filter((row) => row.needsAttention).length;

  return (
    <>
      <PageHeader
        title="Sinh viên cố vấn"
        description={`${classes.map((entry) => entry.className).join(", ")} · ${rows.length} sinh viên, ${attention} cần chú ý`}
      />
      <AdviseeTable rows={rows} studentHrefBase="/lecturer/advising/students/" />
    </>
  );
}
