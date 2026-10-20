import type { Metadata } from "next";
import Link from "next/link";
import { APPOINTMENT_MODE_LABEL } from "@/modules/advising/advising.constant";
import { getAppointments } from "@/modules/advising/advising.query";
import { EXAM_KIND_LABEL } from "@/modules/exams/exams.constant";
import { getExamsForLecturer } from "@/modules/exams/exams.query";
import { REQUEST_KINDS } from "@/modules/requests/requests.constant";
import { getRequestsForAssignee } from "@/modules/requests/requests.query";
import { getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import type { ClassMeeting, ClassSectionView } from "@/modules/course-registration/course-registration.type";
import { GRADE_SHEET_STATE } from "@/modules/grades/grades.constant";
import { getAcademicWarnings, getGradeSheetSummaries } from "@/modules/grades/grades.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getStudyPlans } from "@/modules/study-plan/study-plan.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, daysUntil, formatDate, formatDateTime, schoolTime, weekdayOf } from "@/shared/libs/date.lib";

export const metadata: Metadata = { title: "Tổng quan giảng viên" };

type Slot = { section: ClassSectionView; meeting: ClassMeeting };

function slotsOf(sections: ClassSectionView[]): Slot[] {
  return sections
    .flatMap((section) => section.meetings.map((meeting) => ({ section, meeting })))
    .toSorted((a, b) => a.meeting.dayOfWeek - b.meeting.dayOfWeek || a.meeting.startPeriod - b.meeting.startPeriod);
}

function nextSlot(slots: Slot[], today: number) {
  const ahead = slots.find((slot) => slot.meeting.dayOfWeek > today);
  return ahead ?? slots[0];
}

function deadlineText(deadline: string) {
  const days = daysUntil(deadline);
  if (days < 0) return `Quá hạn ${-days} ngày`;
  if (days === 0) return "Hết hạn hôm nay";
  return `Còn ${days} ngày`;
}

export default async function Page() {
  const [lecturer, term, regulation] = await Promise.all([getCurrentLecturer(), getCurrentTerm(), getRegulation()]);
  // Cố vấn duyệt kế hoạch trong số ngày quy chế quy định.
  const reviewDays = regulation.workflow.studyPlanReviewDays;
  const sections = await getLecturerClassSections(lecturer.id, term.id);
  const summaries = await getGradeSheetSummaries(sections.map((section) => section.id));
  const advisees = lecturer.isAdvisor ? await getAdvisees(lecturer.id) : [];
  const adviseeIds = advisees.map((student) => student.id);
  const [plans, warnings] = lecturer.isAdvisor ? await Promise.all([getStudyPlans(adviseeIds), getAcademicWarnings(adviseeIds)]) : [[], []];
  const [assignedRequests, exams, appointments] = await Promise.all([
    getRequestsForAssignee(),
    getExamsForLecturer(lecturer.id),
    lecturer.isAdvisor ? getAppointments(lecturer.id) : Promise.resolve([]),
  ]);
  // Chỉ đơn đang chờ ở bước của chính giảng viên (quyền tính ở server, cùng hàm với action duyệt).
  const waitingRequests = assignedRequests.filter((request) => request.can.decide);
  const overdueRequests = waitingRequests.filter((request) => request.isOverdue).length;
  const upcomingProctoring = exams
    .filter((exam) => exam.proctors.some((proctor) => proctor.id === lecturer.id) && !dayjs(exam.date).isBefore(dayjs(), "day"))
    .slice(0, 3);
  const todayAppointments = appointments
    .filter((appointment) => appointment.status === "scheduled" && dayjs(appointment.date).isSame(dayjs(), "day"))
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime));

  const today = weekdayOf(dayjs());
  const slots = slotsOf(sections);
  const todaySlots = slots.filter((slot) => slot.meeting.dayOfWeek === today);
  const upcoming = todaySlots.length === 0 && slots.length > 0 ? nextSlot(slots, today) : null;
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const urgentSheets = summaries
    .filter((summary) => summary.state === "overdue" || summary.state === "due-soon")
    .toSorted((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf());
  const pendingPlans = plans.filter((plan) => plan.status === "pending");
  const stalePlans = pendingPlans.filter((plan) => plan.submittedAt && -daysUntil(plan.submittedAt) > reviewDays);
  const openWarnings = warnings.filter((warning) => warning.status !== "resolved");
  const totalStudents = sections.reduce((sum, section) => sum + section.enrolled, 0);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`${weekdayLabel(today)}, ${schoolTime().format("DD/MM/YYYY")}. ${term.name}.`}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <SectionCard flush title="Lịch dạy hôm nay" extra={<Link href="/lecturer/schedule" className="text-sm">Cả tuần</Link>} className="h-full">
              {todaySlots.length === 0 ? (
                <EmptyState
                  illustration="calendar"
                  title="Hôm nay không có buổi dạy"
                  description={
                    upcoming
                      ? `Buổi gần nhất: ${upcoming.section.courseName}, ${weekdayLabel(upcoming.meeting.dayOfWeek)}, ${periodTimeRange(upcoming.meeting.startPeriod, upcoming.meeting.endPeriod)}, phòng ${upcoming.meeting.room}.`
                      : "Học kỳ này chưa có lớp nào được phân công."
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {todaySlots.map(({ section, meeting }) => (
                    <li key={`${section.id}-${meeting.startPeriod}`} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                      <span className="flex w-28 shrink-0 flex-col">
                        <span className="font-medium tabular-nums">{periodTimeRange(meeting.startPeriod, meeting.endPeriod)}</span>
                        <span className="text-xs text-muted">{periodLabel(meeting.startPeriod, meeting.endPeriod)}</span>
                      </span>
                      <Link href={`/lecturer/classes/${section.id}`} className="flex min-w-0 flex-1 flex-col text-foreground">
                        <span className="truncate font-medium">{section.courseName}</span>
                        <span className="text-xs text-muted">
                          {section.code} · Phòng {meeting.room} · <span className="tabular-nums">{section.enrolled}</span> sinh viên
                        </span>
                      </Link>
                      <Link href={`/lecturer/classes/${section.id}/attendance`} className="shrink-0 text-sm">
                        Điểm danh
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 self-start lg:grid-cols-1">
            <StatTile label="Lớp đang dạy" value={sections.length} hint={`${totalStudents} sinh viên`} href="/lecturer/classes" />
            <StatTile label="Buổi dạy mỗi tuần" value={slots.length} hint={`${slots.reduce((sum, slot) => sum + slot.meeting.endPeriod - slot.meeting.startPeriod + 1, 0)} tiết`} href="/lecturer/schedule" />
          </div>
        </div>

        <SectionCard flush title="Bảng điểm cần xử lý" extra={<Link href="/lecturer/classes" className="text-sm">Tất cả lớp</Link>}>
          {urgentSheets.length === 0 ? (
            <EmptyState illustration="done" title="Không có bảng điểm sắp hết hạn" description="Các lớp còn trên 5 ngày để nhập điểm hoặc đã chốt." />
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {urgentSheets.map((summary) => {
                const section = sectionById.get(summary.classSectionId)!;
                return (
                  <li key={summary.classSectionId}>
                    <Link
                      href={`/lecturer/classes/${section.id}/grading`}
                      className="flex flex-col gap-2 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{section.courseName}</span>
                        <span className="text-xs text-muted">
                          {section.code} · Hạn {formatDateTime(summary.deadline)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 sm:w-56">
                        <MeterBar value={summary.filledCells} max={summary.totalCells} label="Đã nhập" />
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {summary.filledCells}/{summary.totalCells} điểm
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 sm:w-48 sm:justify-end">
                        <span className={`text-xs tabular-nums ${summary.state === "overdue" ? "text-rose-700" : "text-amber-700"}`}>
                          {deadlineText(summary.deadline)}
                        </span>
                        {summary.state !== "overdue" && <StatusTag status={GRADE_SHEET_STATE[summary.state]} />}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <SectionCard
            flush
            title="Đơn chờ tôi xử lý"
            extra={
              <Link href="/lecturer/requests" className="text-sm">
                Đơn từ
              </Link>
            }
          >
            {waitingRequests.length === 0 ? (
              <EmptyState title="Không có đơn chờ bạn" />
            ) : (
              <div className="flex flex-col gap-3 p-4 sm:p-5">
                <p className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{waitingRequests.length}</span>
                  <span className="text-sm text-muted">đơn</span>
                  {overdueRequests > 0 && <span className="text-sm text-rose-700 tabular-nums">{overdueRequests} quá hạn</span>}
                </p>
                <ul className="flex flex-col gap-2 text-sm">
                  {waitingRequests.slice(0, 3).map((request) => (
                    <li key={request.id} className="flex min-w-0 flex-col">
                      <span className="truncate">{REQUEST_KINDS[request.kind].label}: {request.requesterName}</span>
                      <span className={`truncate text-xs ${request.isOverdue ? "text-rose-700" : "text-muted"}`}>{request.subject}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>

          <SectionCard
            flush
            title="Lịch coi thi sắp tới"
            extra={
              <Link href="/lecturer/exams" className="text-sm">
                Lịch thi
              </Link>
            }
          >
            {upcomingProctoring.length === 0 ? (
              <EmptyState illustration="calendar" title="Không có ca coi thi sắp tới" />
            ) : (
              <ul className="flex flex-col divide-y divide-border-strong">
                {upcomingProctoring.map((exam) => (
                  <li key={exam.id} className="flex flex-col px-4 py-3 sm:px-5">
                    <span className="truncate font-medium">{exam.courseName}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {EXAM_KIND_LABEL[exam.kind]} · {weekdayLabel(weekdayOf(exam.date))}, {formatDate(exam.date)}, {exam.startTime} · phòng {exam.proctors.find((proctor) => proctor.id === lecturer.id)?.room ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {lecturer.isAdvisor && (
            <SectionCard
              flush
              title="Lịch hẹn cố vấn hôm nay"
              extra={
                <Link href="/lecturer/advising/appointments" className="text-sm">
                  Lịch hẹn
                </Link>
              }
            >
              {todayAppointments.length === 0 ? (
                <EmptyState illustration="calendar" title="Hôm nay không có lịch hẹn" />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {todayAppointments.map((appointment) => (
                    <li key={appointment.id} className="flex flex-col px-4 py-3 sm:px-5">
                      <span className="text-sm font-medium tabular-nums">
                        {appointment.startTime} · {appointment.students.map((student) => student.fullName).join(", ")}
                      </span>
                      <span className="truncate text-xs text-muted">
                        {appointment.topic} · {APPOINTMENT_MODE_LABEL[appointment.mode]}, {appointment.location}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>

        {lecturer.isAdvisor && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Kế hoạch chờ duyệt"
              value={pendingPlans.length}
              hint={stalePlans.length > 0 ? `${stalePlans.length} kế hoạch chờ quá ${reviewDays} ngày` : "Không có kế hoạch chờ lâu"}
              tone={stalePlans.length > 0 ? "warning" : undefined}
              href="/lecturer/advising/study-plans"
            />
            <StatTile
              label="Sinh viên bị cảnh báo"
              value={openWarnings.length}
              hint={openWarnings.length > 0 ? "Cần gặp hoặc gửi thông báo" : "Không có cảnh báo mở"}
              tone={openWarnings.length > 0 ? "danger" : undefined}
              href="/lecturer/advising/academic-warnings"
            />
            <StatTile label="Sinh viên cố vấn" value={advisees.length} hint={`${new Set(advisees.map((student) => student.className)).size} lớp sinh hoạt`} href="/lecturer/advising/students" />
            <StatTile
              label="Chưa nộp kế hoạch"
              value={plans.filter((plan) => plan.status === "draft").length + advisees.length - plans.length}
              hint="Nhắc trước khi đợt đăng ký mở"
              href="/lecturer/advising/study-plans"
            />
          </div>
        )}
      </div>
    </>
  );
}
