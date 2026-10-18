import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CircleCheck } from "defeat-icons-react";
import { getClassRoster, getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import type { ClassMeeting, ClassSectionView } from "@/modules/course-registration/course-registration.type";
import { GRADE_SHEET_STATE } from "@/modules/grades/grades.constant";
import { getAcademicWarnings, getGradeSheetSummaries } from "@/modules/grades/grades.query";
import { PENDING_TOO_LONG_DAYS } from "@/modules/study-plan/study-plan.constant";
import { getStudyPlans } from "@/modules/study-plan/study-plan.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, daysUntil, formatDateTime, weekdayOf } from "@/shared/libs/date.lib";

export const metadata: Metadata = { title: "Tổng quan giảng viên" };

type Slot = { section: ClassSectionView; meeting: ClassMeeting };

function slotsOf(sections: ClassSectionView[]): Slot[] {
  return sections
    .flatMap((section) => section.meetings.map((meeting) => ({ section, meeting })))
    .sort((a, b) => a.meeting.dayOfWeek - b.meeting.dayOfWeek || a.meeting.startPeriod - b.meeting.startPeriod);
}

function nextSlot(slots: Slot[], today: number) {
  const ahead = slots.find((slot) => slot.meeting.dayOfWeek > today);
  return ahead ?? slots[0];
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border-strong bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border-strong px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function deadlineText(deadline: string) {
  const days = daysUntil(deadline);
  if (days < 0) return `Quá hạn ${-days} ngày`;
  if (days === 0) return "Hết hạn hôm nay";
  return `Còn ${days} ngày`;
}

export default async function Page() {
  const [lecturer, term] = await Promise.all([getCurrentLecturer(), getCurrentTerm()]);
  const sections = await getLecturerClassSections(lecturer.id, term.id);
  const rosters = await Promise.all(sections.map((section) => getClassRoster(section.id)));
  const summaries = await getGradeSheetSummaries(
    sections.map((section, index) => ({ classSectionId: section.id, studentIds: rosters[index].map((entry) => entry.studentId) })),
  );
  const advisees = lecturer.isAdvisor ? await getAdvisees(lecturer.id) : [];
  const adviseeIds = advisees.map((student) => student.id);
  const [plans, warnings] = lecturer.isAdvisor ? await Promise.all([getStudyPlans(adviseeIds), getAcademicWarnings(adviseeIds)]) : [[], []];

  const today = weekdayOf(dayjs());
  const slots = slotsOf(sections);
  const todaySlots = slots.filter((slot) => slot.meeting.dayOfWeek === today);
  const upcoming = todaySlots.length === 0 && slots.length > 0 ? nextSlot(slots, today) : null;
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const urgentSheets = summaries
    .filter((summary) => summary.state === "overdue" || summary.state === "due-soon")
    .sort((a, b) => dayjs(a.deadline).valueOf() - dayjs(b.deadline).valueOf());
  const pendingPlans = plans.filter((plan) => plan.status === "pending");
  const stalePlans = pendingPlans.filter((plan) => plan.submittedAt && -daysUntil(plan.submittedAt) > PENDING_TOO_LONG_DAYS);
  const openWarnings = warnings.filter((warning) => warning.status !== "resolved");
  const totalStudents = sections.reduce((sum, section) => sum + section.enrolled, 0);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`${weekdayLabel(today)}, ${dayjs().format("DD/MM/YYYY")}. ${term.name}.`}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Section title="Lịch dạy hôm nay" action={<Link href="/lecturer/schedule" className="text-sm">Cả tuần</Link>}>
              {todaySlots.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
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
                          <span className="font-mono">{section.code}</span> · Phòng {meeting.room} · <span className="tabular-nums">{section.enrolled}</span> sinh viên
                        </span>
                      </Link>
                      <Link href={`/lecturer/classes/${section.id}/attendance`} className="shrink-0 text-sm">
                        Điểm danh
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 self-start lg:grid-cols-1">
            <StatTile label="Lớp đang dạy" value={sections.length} hint={`${totalStudents} sinh viên`} href="/lecturer/classes" />
            <StatTile label="Buổi dạy mỗi tuần" value={slots.length} hint={`${slots.reduce((sum, slot) => sum + slot.meeting.endPeriod - slot.meeting.startPeriod + 1, 0)} tiết`} href="/lecturer/schedule" />
          </div>
        </div>

        <Section title="Bảng điểm cần xử lý" action={<Link href="/lecturer/classes" className="text-sm">Tất cả lớp</Link>}>
          {urgentSheets.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Không có bảng điểm sắp hết hạn" description="Các lớp còn trên 5 ngày để nhập điểm hoặc đã chốt." />
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
                          <span className="font-mono">{section.code}</span> · Hạn {formatDateTime(summary.deadline)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 sm:w-56">
                        <MeterBar value={summary.filledCells} max={summary.totalCells} label="Đã nhập" />
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {summary.filledCells}/{summary.totalCells} ô
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 sm:w-48 sm:justify-end">
                        <span className={`text-xs tabular-nums ${summary.state === "overdue" ? "text-rose-700" : "text-amber-700"}`}>
                          {deadlineText(summary.deadline)}
                        </span>
                        <StatusTag status={GRADE_SHEET_STATE[summary.state]} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {lecturer.isAdvisor && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Kế hoạch chờ duyệt"
              value={pendingPlans.length}
              hint={stalePlans.length > 0 ? `${stalePlans.length} kế hoạch chờ quá ${PENDING_TOO_LONG_DAYS} ngày` : "Không có kế hoạch chờ lâu"}
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
