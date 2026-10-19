import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "antd";
import { getAnnouncements } from "@/modules/announcements/announcements.query";
import { ANNOUNCEMENT_CATEGORY_LABEL, ANNOUNCEMENT_STATUS } from "@/modules/announcements/announcements.constant";
import {
  getClassSections,
  getCurrentTerm,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
} from "@/modules/course-registration/course-registration.query";
import { REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import type { ClassSectionView, RegistrationPeriodView } from "@/modules/course-registration/course-registration.type";
import { getAcademicWarnings } from "@/modules/grades/grades.query";
import { getStudents } from "@/modules/users/users.query";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { can, inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { getRequests } from "@/modules/requests/requests.query";

export const metadata: Metadata = { title: "Tổng quan quản trị" };

type Issue = { section: ClassSectionView; reason: string; tone: "warning" | "danger" };

function sectionIssues(sections: ClassSectionView[]): Issue[] {
  return sections.flatMap((section): Issue[] => {
    if (section.status === "cancelled") return [];
    if (section.conflicts.length > 0) return [{ section, reason: section.conflicts[0].message, tone: "danger" }];
    if (!section.lecturerId) return [{ section, reason: "Chưa phân công giảng viên", tone: "warning" }];
    if (section.status === "draft") return [{ section, reason: "Lớp còn ở trạng thái nháp, sinh viên chưa thấy để đăng ký", tone: "warning" }];
    if (section.isFull) return [{ section, reason: `Đã đủ ${section.enrolled}/${section.capacity} chỗ, cân nhắc mở thêm lớp`, tone: "warning" }];
    return [];
  });
}

function hoursText(hours: number) {
  if (hours < 1) return "dưới 1 giờ";
  if (hours < 48) return `${Math.floor(hours)} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}

function periodHint(period: RegistrationPeriodView) {
  if (period.state === "upcoming") return `Mở lúc ${formatDateTime(period.opensAt)}`;
  if (period.state === "closed") return `Đã đóng ${formatDate(period.closesAt)}`;
  return `Đóng sau ${hoursText(period.hoursLeft)}, lúc ${formatDateTime(period.closesAt)}`;
}

export default async function Page() {
  const viewer = await requirePermission("dashboard.view");
  const [currentTerm, targetTerm] = await Promise.all([getCurrentTerm(), getRegistrationTargetTerm()]);
  const [allStudents, allSections, periods, allWarnings, announcements, allRequests] = await Promise.all([
    getStudents(),
    getClassSections(targetTerm.id),
    getRegistrationPeriods(targetTerm.id),
    getAcademicWarnings(),
    getAnnouncements(),
    getRequests(),
  ]);
  const students = allStudents.filter((student) => inScope(viewer, student.faculty));
  const sections = allSections.filter((section) => inScope(viewer, section.faculty));
  const warnings = allWarnings.filter((warning) => inScope(viewer, warning.faculty));
  const openRequests = allRequests.filter(
    (request) => inScope(viewer, request.faculty) && (request.status === "pending" || request.status === "in-review") && request.currentStep?.role !== "advisor" && request.currentStep?.role !== "lecturer",
  );
  const overdueRequests = openRequests.filter((request) => request.isOverdue).length;

  const studying = students.filter((student) => student.status === "studying").length;
  const openSections = sections.filter((section) => section.status === "open");
  const draftSections = sections.filter((section) => section.status === "draft").length;
  const capacity = openSections.reduce((sum, section) => sum + section.capacity, 0);
  const enrolled = openSections.reduce((sum, section) => sum + section.enrolled, 0);
  const fillRate = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
  const newWarnings = warnings.filter((warning) => warning.status === "new").length;
  const issues = sectionIssues(sections);
  const closing = periods.filter((period) => period.state === "closing");
  const recentAnnouncements = announcements.filter((announcement) => announcement.status !== "archived").slice(0, 5);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`Đang học ${currentTerm.name}. Đang mở đăng ký cho ${targetTerm.name}.${viewer.faculty ? ` Số liệu thuộc ${viewer.faculty}.` : ""}`}
      />

      <div className="flex flex-col gap-4 sm:gap-6">
        {closing.map((period) => (
          <Alert
            key={period.id}
            type="warning"
            showIcon
            title={`${period.name} đóng sau ${hoursText(period.hoursLeft)}`}
            description={
              <span className="tabular-nums">
                Còn {period.eligibleStudents - period.registeredStudents}/{period.eligibleStudents} sinh viên chưa đăng ký. Gửi nhắc
                qua mục Thông báo nếu cần.
              </span>
            }
            action={<Link href="/administrator/terms">Xem đợt</Link>}
          />
        ))}

        <div className="flex flex-wrap gap-3 *:min-w-40 *:flex-1 *:basis-48">
          {can(viewer, "requests.process") && (
            <StatTile
              label="Đơn từ chờ xử lý"
              value={openRequests.length}
              hint={overdueRequests > 0 ? `${overdueRequests} đơn đã quá hạn` : "Không có đơn quá hạn"}
              tone={overdueRequests > 0 ? "danger" : undefined}
              href="/administrator/requests"
            />
          )}
          <StatTile label="Sinh viên đang học" value={studying.toLocaleString("vi-VN")} hint={`Trên tổng ${students.length} hồ sơ`} href="/administrator/users/students" />
          <StatTile
            label={`Lớp mở ${targetTerm.shortName}`}
            value={openSections.length}
            hint={draftSections > 0 ? `${draftSections} lớp còn nháp` : "Không còn lớp nháp"}
            tone={draftSections > 0 ? "warning" : undefined}
            href={`/administrator/class-sections?term=${targetTerm.id}`}
          />
          <StatTile label="Tỉ lệ lấp đầy chỗ" value={`${fillRate}%`} hint={`${enrolled.toLocaleString("vi-VN")}/${capacity.toLocaleString("vi-VN")} chỗ đã đăng ký`} />
          <StatTile
            label="Cảnh báo học vụ chưa xử lý"
            value={newWarnings}
            hint={`Trên ${warnings.length} sinh viên bị cảnh báo`}
            tone={newWarnings > 0 ? "warning" : undefined}
            href="/administrator/reports/academic-warnings"
          />
        </div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <SectionCard
              flush
              title="Lớp học phần cần xử lý"
              extra={<Link href={`/administrator/class-sections?term=${targetTerm.id}`} className="text-sm">Tất cả lớp</Link>}
            >
              {issues.length === 0 ? (
                <EmptyState illustration="done" title="Không có lớp cần xử lý" description="Mọi lớp đã có giảng viên, không trùng phòng hay trùng giờ." />
              ) : (
                <ul className="flex flex-col divide-y divide-border-strong">
                  {issues.map(({ section, reason, tone }) => (
                    <li key={section.id}>
                      <Link
                        href={`/administrator/class-sections?term=${targetTerm.id}&q=${section.code}`}
                        className="flex flex-col gap-1 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{section.courseName}</span>
                          <span className="text-xs text-muted">{section.code}</span>
                        </span>
                        <span className={`min-w-0 text-sm text-pretty sm:w-80 ${tone === "danger" ? "text-rose-700" : "text-amber-700"}`}>
                          {reason}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
            <SectionCard flush title="Đợt đăng ký" extra={<Link href="/administrator/terms" className="text-sm">Cấu hình</Link>}>
              <ul className="flex flex-col divide-y divide-border-strong">
                {periods.map((period) => (
                  <li key={period.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium text-pretty">{period.name}</span>
                      <StatusTag status={REGISTRATION_PERIOD_STATE[period.state]} className="shrink-0" />
                    </div>
                    <span className="text-xs text-muted tabular-nums">{periodHint(period)}</span>
                    {period.state !== "upcoming" && (
                      <div className="flex items-center gap-3">
                        <MeterBar value={period.registeredStudents} max={period.eligibleStudents} label={`Đã đăng ký ${period.name}`} />
                        <span className="shrink-0 text-xs text-muted tabular-nums">
                          {period.registeredStudents}/{period.eligibleStudents}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard flush title="Thông báo" extra={<Link href="/administrator/announcements" className="text-sm">Quản lý</Link>}>
              <ul className="flex flex-col divide-y divide-border-strong">
                {recentAnnouncements.map((announcement) => (
                  <li key={announcement.id} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                    <span className="line-clamp-2 font-medium text-pretty">{announcement.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      {ANNOUNCEMENT_CATEGORY_LABEL[announcement.category]}
                      <span className="tabular-nums">{announcement.publishedAt ? formatDate(announcement.publishedAt) : "Chưa đăng"}</span>
                      {announcement.status !== "published" && <StatusTag status={ANNOUNCEMENT_STATUS[announcement.status]} />}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
