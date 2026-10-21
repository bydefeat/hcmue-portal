import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PrintButton } from "@/shared/components/ui/print-button";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { PrintableTranscript } from "@/modules/grades/components/printable-transcript";
import { TranscriptView } from "@/modules/grades/components/transcript-view";
import { downloadStudentTranscriptPdf } from "@/modules/grades/grades.action";
import { formatPoint, standingLabel, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getCurrentWarnings, getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { STUDY_PLAN_STATUS } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { StudentProfileCard } from "@/modules/users/components/student-profile-card";
import { getAdvisorAssignments, getDecisions, getStudentByCode } from "@/modules/users/users.query";
import { DECISION_KIND_LABEL, DECISION_STATUS, DISCIPLINE_LEVEL_LABEL } from "@/modules/users/users.constant";
import { AuditTimeline } from "@/modules/audit/components/audit-timeline";
import { getAuditLog } from "@/modules/audit/audit.query";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { AdminStudentRegistration } from "@/modules/course-registration/components/admin-student-registration";
import { inProgressCodesFor } from "@/modules/course-registration/course-registration.rule";
import { latestGrades } from "@/modules/grades/grades.rule";
import { getClassSections, getCreditLimits, getCurrentTerm, getRegistrationEvents, getRegistrationHolds, getRegistrationTargetTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { SectionCard } from "@/shared/components/ui/section-card";

type PageProps = { params: Promise<{ studentCode: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const viewer = await requirePermission("students.view");
  const { studentCode } = await params;
  const student = await getStudentByCode(studentCode);
  return { title: student && inScope(viewer, student.faculty) ? student.fullName : "Không tìm thấy sinh viên" };
}

export default async function Page({ params }: PageProps) {
  const viewer = await requirePermission("students.view");
  const { studentCode } = await params;
  const student = await getStudentByCode(studentCode);
  if (!student) notFound();
  if (!inScope(viewer, student.faculty)) forbidden();

  const [assignments, [standing], transcript, plan, decisions, history, warnings] = await Promise.all([
    getAdvisorAssignments(),
    getStudentStandings([student.id]),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
    getDecisions(student.id),
    getAuditLog({ entityType: "student", entityId: student.id }),
    getCurrentWarnings([student.id]),
  ]);
  const warning = warnings[student.id];
  const advisorName = assignments.find((assignment) => assignment.className === student.className)?.advisorName ?? null;
  const [targetTerm, currentTerm] = await Promise.all([getRegistrationTargetTerm(), getCurrentTerm()]);
  const [targetSections, targetEnrollments, currentEnrollments, holds, courses, credit] = await Promise.all([
    getClassSections(targetTerm.id),
    getStudentEnrollments(student.id, targetTerm.id),
    getStudentEnrollments(student.id, currentTerm.id),
    getRegistrationHolds(student.id),
    getCourses(),
    getCreditLimits(student.id, targetTerm.id),
  ]);
  const registrationEvents = await getRegistrationEvents(student.id, targetTerm.id);
  const hasResults = standing.cpa4 !== null;
  const canRegister = can(viewer, "registration.manage");

  return (
    <>
      <PrintableTranscript student={student} terms={transcript} standing={standing} />
      <div className="print:hidden">
        <PageHeader
          back={{ href: "/administrator/users/students", label: "Sinh viên" }}
          title={student.fullName}
          description={`${student.majorName}, lớp ${student.className}`}
          actions={
            <>
              <DownloadPdfButton action={downloadStudentTranscriptPdf.bind(null, student.id)} label="Tải bảng điểm PDF" />
              <PrintButton label="In bảng điểm" />
            </>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-4">
            <StudentProfileCard student={student} advisorName={advisorName} />
            <SectionCard title="Kế hoạch học tập">
              <div className="flex flex-col gap-2">
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
              </div>
            </SectionCard>
            <SectionCard title="Quyết định">
              <div className="flex flex-col gap-2">
                {decisions.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có quyết định nào liên quan đến sinh viên.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {decisions.map((decision) => (
                      <li key={decision.id} className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-pretty">{DECISION_KIND_LABEL[decision.kind]}</span>
                          <StatusTag status={DECISION_STATUS[decision.status]} />
                        </div>
                        <span className="text-xs text-muted tabular-nums">
                          {decision.number ?? "Chưa có số"} · hiệu lực {formatDate(decision.effectiveDate)}
                          {decision.disciplineLevel ? ` · ${DISCIPLINE_LEVEL_LABEL[decision.disciplineLevel]}` : ""}
                          {decision.status === "signed" && !decision.appliedAt ? " · chờ tới ngày hiệu lực" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SectionCard>
            <SectionCard title="Lịch sử thay đổi">
              <div className="flex flex-col gap-3">
                <AuditTimeline entries={history} emptyText="Hồ sơ chưa được sửa kể từ khi nhập học." />
              </div>
            </SectionCard>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile
                label="CPA"
                value={hasResults ? formatPoint(standing.cpa4) : "Chưa có"}
                hint={hasResults ? `Thang 10: ${formatPoint(standing.cpa10)}` : undefined}
              />
              <StatTile label="Tín chỉ tích lũy" value={standing.earnedCredits} hint={standing.failedCredits > 0 ? `Nợ ${standing.failedCredits} tín chỉ` : "Không nợ tín chỉ"} tone={standing.failedCredits > 0 ? "warning" : undefined} />
              <StatTile label="Xếp loại" value={standingLabel(standing.standing)} />
              <StatTile
                label="Cảnh báo học vụ"
                value={warning ? WARNING_LEVEL[warning.level].label : "Không"}
                hint={warning ? `Sau ${warning.termName.toLowerCase()}` : standing.warningLevel > 0 ? `Dự báo mức ${standing.warningLevel} theo điểm hiện có` : undefined}
                tone={warning ? "danger" : undefined}
              />
            </div>
            {canRegister && (
            <AdminStudentRegistration
              studentId={student.id}
              studentName={student.fullName}
              student={{ majorCode: student.majorCode, cohort: student.cohort }}
              termName={targetTerm.name}
              sections={targetSections.filter((section) => section.status === "open")}
              registered={targetEnrollments.map((entry) => entry.section)}
              holds={holds}
              events={registrationEvents.filter((event) => event.kind !== "section-cancelled")}
              passedGrades={latestGrades(transcript)}
              prerequisites={Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]))}
              corequisites={Object.fromEntries(courses.map((course) => [course.code, course.corequisiteCodes]))}
              equivalents={Object.fromEntries(courses.map((course) => [course.code, course.equivalentCodes]))}
              courseNames={Object.fromEntries(courses.map((course) => [course.code, course.name]))}
              credits={credit?.limits ?? { min: 0, max: 0 }}
              inProgressCodes={inProgressCodesFor(targetTerm.id, currentTerm.id, currentEnrollments.map(({ section }) => section.courseCode))}
              actorName={viewer.name}
            />
            )}
            <SectionCard title="Kết quả học tập" flush>
              <TranscriptView terms={transcript} inCard />
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
