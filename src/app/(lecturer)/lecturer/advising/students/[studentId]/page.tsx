import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Hồ sơ sinh viên" };

export default async function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const lecturer = await getCurrentLecturer();
  const advisees = await getAdvisees(lecturer.id);
  const student = advisees.find((entry) => entry.id === studentId);
  if (!student) notFound();
  const [[standing], transcript, plan] = await Promise.all([
    getStudentStandings([student.id]),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
  ]);

  return (
    <>
      <PageHeader title={student.fullName} back={{ href: "/lecturer/advising/students", label: "Sinh viên cố vấn" }} />
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <StudentProfileCard student={student} advisorName={lecturer.displayName} />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="CPA hệ 4" value={formatPoint(standing.cpa4)} hint={STANDING_LABEL[standing.standing]} tone={standing.cpa4 < 2 ? "warning" : undefined} />
            <StatTile label="Tín chỉ tích lũy" value={standing.earnedCredits} />
            <StatTile
              label="Tín chỉ nợ"
              value={standing.failedCredits}
              hint={standing.failedCredits > 0 ? "Cần đăng ký học lại" : "Không nợ học phần"}
              tone={standing.failedCredits > 0 ? "danger" : undefined}
            />
            <StatTile
              label="Cảnh báo học vụ"
              value={standing.warningLevel > 0 ? WARNING_LEVEL[standing.warningLevel as 1 | 2 | 3].label : "Không"}
              hint={standing.warningLevel > 0 ? "Hẹn gặp sinh viên trong tháng" : undefined}
              tone={standing.warningLevel > 0 ? "danger" : undefined}
            />
          </div>

          <section className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Kế hoạch học tập</h2>
              {plan && <StatusTag status={STUDY_PLAN_STATUS[plan.status]} />}
            </div>
            {plan ? (
              <>
                <p className="text-sm text-muted tabular-nums">
                  {plan.targetTermName}: {plan.totalCredits} tín chỉ, {plan.terms[0]?.courses.length ?? 0} học phần
                  {plan.submittedAt ? `. Nộp lúc ${formatDateTime(plan.submittedAt)}` : ". Sinh viên chưa nộp"}
                </p>
                {plan.status === "pending" && (
                  <Link href="/lecturer/advising/study-plans" className="w-fit text-sm">
                    Xét duyệt kế hoạch
                  </Link>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Sinh viên chưa lập kế hoạch học tập.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Kết quả học tập</h2>
            <TranscriptView terms={transcript} />
          </section>
        </div>
      </div>
    </>
  );
}
