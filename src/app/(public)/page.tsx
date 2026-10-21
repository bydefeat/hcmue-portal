import Link from "next/link";
import { Card } from "antd";
import { ArrowRight } from "defeat-icons-react";
import { PublicAnnouncementItem } from "@/modules/announcements/components/public-announcement-item";
import { getPublishedAnnouncements } from "@/modules/announcements/announcements.query";
import { getPublicRegistrationSchedule } from "@/modules/course-registration/course-registration.query";
import { REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import { CALENDAR_EVENT_LABEL } from "@/modules/settings/settings.constant";
import { getCalendarEvents } from "@/modules/settings/settings.query";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { PUBLIC_SIGN_IN_HREF } from "@/shared/constants/navigation.constant";

const PORTALS = [
  { title: "Sinh viên", description: "Đăng ký học phần, thời khóa biểu, lịch thi, kết quả học tập, đơn từ.", href: PUBLIC_SIGN_IN_HREF },
  { title: "Giảng viên, cố vấn", description: "Lịch dạy, điểm danh, nhập điểm, duyệt kế hoạch học tập.", href: PUBLIC_SIGN_IN_HREF },
  { title: "Phòng Đào tạo", description: "Mở lớp, đợt đăng ký, duyệt điểm, quyết định, báo cáo.", href: PUBLIC_SIGN_IN_HREF },
];

export default async function Page() {
  const [{ currentTerm, targetTerm, periods, active }, announcements, events] = await Promise.all([
    getPublicRegistrationSchedule(),
    getPublishedAnnouncements(6),
    getCalendarEvents(),
  ]);
  const today = dayjs().startOf("day");
  const upcoming = events.filter((event) => !dayjs(event.endDate).isBefore(today)).slice(0, 6);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Cổng đào tạo và học vụ"
        description={`Hiện tại: ${currentTerm.name.toLowerCase()}. Thông báo đào tạo mới nhất và lịch đăng ký học phần ${targetTerm.name.toLowerCase()}.`}
      />

      {active.map((period) => (
        <Link key={period.id} href={PUBLIC_SIGN_IN_HREF} className="block text-foreground">
          <Card
            size="small"
            className="cursor-pointer transition-colors hover:bg-surface-hover"
            classNames={{ body: "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4" }}
          >
            <StatusTag status={REGISTRATION_PERIOD_STATE[period.state]} className="w-fit" />
            <span className="min-w-0 flex-1 font-medium text-pretty">
              {period.name} đang mở, đóng lúc <span className="tabular-nums">{formatDateTime(period.closesAt)}</span>
            </span>
            <span className="flex items-center gap-1 text-sm text-primary">
              Đăng nhập để đăng ký
              <ArrowRight size={16} aria-hidden />
            </span>
          </Card>
        </Link>
      ))}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <SectionCard
          title="Thông báo đào tạo"
          extra={
            <Link href="/announcements" className="text-sm">
              Tất cả thông báo
            </Link>
          }
          flush
        >
          <ul className="flex flex-col divide-y divide-border-strong">
            {announcements.map((announcement) => (
              <li key={announcement.id}>
                <PublicAnnouncementItem announcement={announcement} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <aside className="flex min-w-0 flex-col gap-6">
          <SectionCard title={`Đợt đăng ký ${targetTerm.shortName}`} flush>
            <ul className="flex flex-col divide-y divide-border-strong">
              {periods.map((period) => (
                <li key={period.id} className="flex flex-col gap-1 px-4 sm:px-5 py-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-pretty">{period.name}</span>
                    <StatusTag status={REGISTRATION_PERIOD_STATE[period.state]} className="shrink-0" />
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {formatDateTime(period.opensAt)} đến {formatDateTime(period.closesAt)}
                  </span>
                  {period.minCredits !== null && period.maxCredits !== null && (
                    <span className="text-xs text-muted tabular-nums">
                      Từ {period.minCredits} đến {period.maxCredits} tín chỉ
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Lịch đào tạo sắp tới" flush>
            <ul className="flex flex-col divide-y divide-border-strong">
              {upcoming.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 px-4 sm:px-5 py-3">
                  <span className="text-pretty">{event.title}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {CALENDAR_EVENT_LABEL[event.kind]} ·{" "}
                    {event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} đến ${formatDate(event.endDate)}`}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Đăng nhập theo vai trò</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {PORTALS.map((portal) => (
            <li key={portal.title}>
              <Link href={portal.href} className="block h-full text-foreground">
                <Card size="small" className="h-full cursor-pointer transition-colors hover:bg-surface-hover" classNames={{ body: "flex flex-col gap-1" }}>
                  <span className="text-base font-medium">{portal.title}</span>
                  <span className="text-sm text-pretty text-muted">{portal.description}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
