import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "antd";
import { BellSlash, CalendarCheck, CalendarClock, Inbox } from "defeat-icons-react";
import { PeriodCountdown } from "@/modules/course-registration/components/student-period-countdown";
import { REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import {
  getCurrentTerm,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getStudentEnrollments,
} from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { EXAM_KIND_LABEL } from "@/modules/exams/exams.constant";
import { getExamsForClassSections } from "@/modules/exams/exams.query";
import { formatPoint, STANDING_LABEL, WARNING_LEVEL } from "@/modules/grades/grades.constant";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { REQUEST_KINDS, REQUEST_STATUS } from "@/modules/requests/requests.constant";
import { getRequestsOf } from "@/modules/requests/requests.query";
import { formatMoney } from "@/modules/tuition/tuition.constant";
import { getInvoices } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, daysUntil, formatDate, formatDateTime, formatRelative, weekdayOf } from "@/shared/libs/date.lib";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function Page() {
  const [student, term, targetTerm, courses] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getRegistrationTargetTerm(), getCourses()]);
  const [enrollments, transcript, [standing], periods, requests, notifications] = await Promise.all([
    getStudentEnrollments(student.id, term.id),
    getTranscript(student.id),
    getStudentStandings([student.id]),
    getRegistrationPeriods(targetTerm.id),
    getRequestsOf(student.id),
    getNotifications("student"),
  ]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const [exams, [invoice]] = await Promise.all([
    getExamsForClassSections(timetable.map(({ section }) => section.id)),
    getInvoices({
      majorCode: student.majorCode,
      terms: [
        {
          termId: term.id,
          termName: term.name,
          isCurrent: true,
          courses: timetable.map(({ section }) => ({ code: section.courseCode, name: section.courseName, credits: section.credits })),
        },
      ],
    }),
  ]);

  const today = weekdayOf(dayjs());
  const slots = timetable
    .flatMap(({ section }) => section.meetings.map((meeting) => ({ section, meeting })))
    .sort((a, b) => a.meeting.dayOfWeek - b.meeting.dayOfWeek || a.meeting.startPeriod - b.meeting.startPeriod);
  const todaySlots = slots.filter((slot) => slot.meeting.dayOfWeek === today);
  const nextSlot = slots.find((slot) => slot.meeting.dayOfWeek > today) ?? slots[0];
  const period = periods.find((entry) => entry.cohorts.includes(student.cohort)) ?? null;
  const upcomingExams = exams.filter((exam) => daysUntil(exam.date) >= 0 && exam.status !== "draft").slice(0, 3);
  const openRequests = requests.filter((request) => request.status === "pending" || request.status === "in-review");
  const unread = notifications.filter((notification) => !notification.isRead);
  const totalCredits = 130;
  const showTuition = invoice && invoice.balance > 0 && invoice.daysToDue <= 14;

  return (
    <>
      <PageHeader title="Tổng quan" description={`${weekdayLabel(today)}, ${dayjs().format("DD/MM/YYYY")}. ${term.name}.`} />
      <div className="flex flex-col gap-4 sm:gap-6">

        {standing.warningLevel > 0 && (
          <Alert
            type="error"
            showIcon
            title={`Bạn đang bị cảnh báo học vụ ${WARNING_LEVEL[standing.warningLevel as 1 | 2 | 3].label.toLowerCase()}`}
            description="Học kỳ tới chỉ được đăng ký tối đa 14 tín chỉ. Hẹn gặp cố vấn học tập để lập kế hoạch cải thiện."
            action={<Link href="/application/grades">Xem kết quả</Link>}
          />
        )}
        {showTuition && (
          <Alert
            type={invoice.status === "overdue" ? "error" : "warning"}
            showIcon
            title={
              invoice.status === "overdue"
                ? `Học phí ${term.shortName} quá hạn ${-invoice.daysToDue} ngày`
                : `Học phí ${term.shortName} còn ${invoice.daysToDue} ngày đến hạn`
            }
            description={`Còn phải nộp ${formatMoney(invoice.balance)}, hạn ${formatDate(invoice.dueDate)}. Quá hạn sẽ bị khóa đăng ký học phần học kỳ sau.`}
            action={<Link href="/application/tuition">Cách nộp</Link>}
          />
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Điểm trung bình tích lũy" value={formatPoint(standing.cpa4)} hint={`Xếp loại ${STANDING_LABEL[standing.standing]}`} href="/application/grades" />
          <StatTile label="Tín chỉ tích lũy" value={`${standing.earnedCredits}/${totalCredits}`} hint={`Học kỳ này ${timetable.reduce((sum, { section }) => sum + section.credits, 0)} tín chỉ`} href="/application/curriculum" />
          <StatTile
            label="Đơn đang xử lý"
            value={openRequests.length}
            hint={openRequests.some((request) => request.isOverdue) ? "Có đơn quá hạn xử lý" : "Theo dõi ở mục Đơn từ"}
            tone={openRequests.some((request) => request.isOverdue) ? "warning" : undefined}
            href="/application/requests"
          />
          <StatTile label="Thông báo chưa đọc" value={unread.length} hint="Hạn chót, điểm, lịch thi" href="/application/notifications" />
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-2">
            <SectionCard title="Lịch học hôm nay" extra={<Link href="/application/schedule" className="text-sm">Cả tuần</Link>} flush>
              {todaySlots.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Hôm nay không có buổi học"
                  description={
                    nextSlot
                      ? `Buổi gần nhất: ${nextSlot.section.courseName}, ${weekdayLabel(nextSlot.meeting.dayOfWeek)}, ${periodTimeRange(nextSlot.meeting.startPeriod, nextSlot.meeting.endPeriod)}, phòng ${nextSlot.meeting.room}.`
                      : "Học kỳ này bạn chưa có lớp nào."
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {todaySlots.map(({ section, meeting }) => (
                    <li key={`${section.id}-${meeting.startPeriod}`} className="flex gap-4 px-4 py-3 sm:px-5">
                      <span className="flex w-24 shrink-0 flex-col">
                        <span className="font-medium tabular-nums">{periodTimeRange(meeting.startPeriod, meeting.endPeriod)}</span>
                        <span className="text-xs text-muted">{periodLabel(meeting.startPeriod, meeting.endPeriod)}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{section.courseName}</span>
                        <span className="text-xs text-muted">
                          {section.code} · Phòng {meeting.room} · {section.lecturerName ?? "Chưa phân công"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Lịch thi sắp tới" extra={<Link href="/application/exams" className="text-sm">Tất cả</Link>} flush>
              {upcomingExams.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Chưa có lịch thi sắp tới" />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {upcomingExams.map((exam) => {
                    const days = daysUntil(exam.date);
                    return (
                      <li key={exam.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                        <span className="flex w-16 shrink-0 flex-col">
                          <span className="font-semibold tabular-nums">{dayjs(exam.date).format("DD/MM")}</span>
                          <span className="text-xs text-muted tabular-nums">{exam.startTime}</span>
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{exam.courseName}</span>
                          <span className="text-xs text-muted">
                            {EXAM_KIND_LABEL[exam.kind]} · Phòng {exam.room}
                          </span>
                        </span>
                        <span className={`shrink-0 text-xs tabular-nums ${days <= 3 ? "text-amber-700" : "text-muted"}`}>
                          {days === 0 ? "Hôm nay" : days === 1 ? "Ngày mai" : `Còn ${days} ngày`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
            <SectionCard title="Đăng ký học phần" extra={<Link href="/application/registration" className="text-sm">Đến trang đăng ký</Link>} flush>
              <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                {period ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium text-pretty">{period.name}</span>
                      <StatusTag status={REGISTRATION_PERIOD_STATE[period.state]} className="shrink-0" />
                    </div>
                    <span className="text-sm">
                      {period.state === "upcoming" && <PeriodCountdown target={period.opensAt} prefix="Mở" />}
                      {(period.state === "open" || period.state === "closing") && <PeriodCountdown target={period.closesAt} prefix="Đóng" />}
                      {period.state === "closed" && `Đã đóng lúc ${formatDateTime(period.closesAt)}`}
                    </span>
                    <span className="text-xs text-pretty text-muted">
                      {targetTerm.name}. Chọn trước các lớp dự kiến để không bị hết chỗ.
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted">Chưa có đợt đăng ký cho khóa {student.cohort}.</span>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Đơn của tôi" extra={<Link href="/application/requests" className="text-sm">Tất cả</Link>} flush>
              {openRequests.length === 0 ? (
                <EmptyState icon={Inbox} title="Không có đơn đang xử lý" />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {openRequests.slice(0, 3).map((request) => (
                    <li key={request.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">{REQUEST_KINDS[request.kind].label}</span>
                        <StatusTag status={REQUEST_STATUS[request.status]} className="shrink-0" />
                      </span>
                      <span className="text-xs text-muted">{request.currentStep ? `Đang ở bước: ${request.currentStep.label}` : request.subject}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Thông báo mới" extra={<Link href="/application/notifications" className="text-sm">Tất cả</Link>} flush>
              {unread.length === 0 ? (
                <EmptyState icon={BellSlash} title="Đã đọc hết thông báo" />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {unread.slice(0, 3).map((notification) => (
                    <li key={notification.id}>
                      <Link href={notification.href} className="flex flex-col gap-0.5 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:px-5">
                        <span className="text-sm font-medium text-pretty">{notification.title}</span>
                        <span className="text-xs text-muted">
                          {NOTIFICATION_KIND_LABEL[notification.kind]} · {formatRelative(notification.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
