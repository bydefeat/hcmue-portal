import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { TranscriptView } from "@/modules/grades/components/transcript-view";
import { formatPoint, STANDING_LABEL, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { STUDY_PLAN_STATUS } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { StudentProfileCard } from "@/modules/users/components/student-profile-card";
import { getAdvisorAssignments, getStudent } from "@/modules/users/users.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

type PageProps = { params: Promise<{ studentId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { studentId } = await params;
  const student = await getStudent(studentId);
  return { title: student ? student.fullName : "Không tìm thấy sinh viên" };
}

export default async function Page({ params }: PageProps) {
  const viewer = await requirePermission("students.view");
  const { studentId } = await params;
  const student = await getStudent(studentId);
  if (!student) notFound();
  if (!inScope(viewer, student.faculty)) forbidden();

  const [assignments, [standing], transcript, plan] = await Promise.all([
    getAdvisorAssignments(),
    getStudentStandings([student.id]),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
  ]);
  const advisorName = assignments.find((assignment) => assignment.className === student.className)?.advisorName ?? null;
  const hasResults = standing.earnedCredits > 0;

  return (
    <>
      <PageHeader
        back={{ href: "/administrator/users/students", label: "Sinh viên" }}
        title={student.fullName}
        description={`${student.majorName}, lớp ${student.className}`}
      />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <StudentProfileCard student={student} advisorName={advisorName} />
          <section className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
            <h2 className="text-base font-semibold">Kế hoạch học tập</h2>
            {plan ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{plan.targetTermName}</span>
                  <StatusTag status={STUDY_PLAN_STATUS[plan.status]} />
                </div>
                <p className="text-xs text-muted tabular-nums">
                  {plan.totalCredits} tín chỉ
                  {plan.submittedAt ? `, nộp lúc ${formatDateTime(plan.submittedAt)}` : ", chưa nộp cho cố vấn"}
                </p>
                {plan.advisorComment && <p className="text-sm text-pretty text-muted">Cố vấn: {plan.advisorComment}</p>}
              </>
            ) : (
              <p className="text-sm text-muted">Sinh viên chưa lập kế hoạch học tập cho học kỳ tới.</p>
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="CPA"
              value={hasResults ? formatPoint(standing.cpa4) : "Chưa có"}
              hint={hasResults ? `Thang 10: ${formatPoint(standing.cpa10)}` : undefined}
            />
            <StatTile label="Tín chỉ tích lũy" value={standing.earnedCredits} hint={standing.failedCredits > 0 ? `Nợ ${standing.failedCredits} tín chỉ` : "Không nợ tín chỉ"} tone={standing.failedCredits > 0 ? "warning" : undefined} />
            <StatTile label="Xếp loại" value={hasResults ? STANDING_LABEL[standing.standing] : "Chưa xếp"} />
            <StatTile
              label="Cảnh báo học vụ"
              value={standing.warningLevel > 0 ? WARNING_LEVEL[standing.warningLevel as 1 | 2 | 3].label : "Không"}
              hint={standing.warningLevel > 0 ? `ĐTB kỳ gần nhất ${formatPoint(standing.lastTermGpa4)}` : undefined}
              tone={standing.warningLevel > 0 ? "danger" : undefined}
            />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Kết quả học tập</h2>
            <TranscriptView terms={transcript} />
          </section>
        </div>
      </div>
    </>
  );
}
