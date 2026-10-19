import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";
import { RegistrationMonitorSections } from "@/modules/course-registration/components/registration-monitor-sections";
import { RegistrationMonitorStudents } from "@/modules/course-registration/components/registration-monitor-students";
import { RegistrationReport } from "@/modules/course-registration/components/registration-report";
import { REGISTRATION_PERIOD_STATE } from "@/modules/course-registration/course-registration.constant";
import {
  getClassSections,
  getRegistrationPeriods,
  getRegistrationQueueStatus,
  getRegistrationSummary,
  getRegistrationTargetTerm,
  getUnregisteredStudents,
} from "@/modules/course-registration/course-registration.query";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Theo dõi đăng ký" };

function hoursText(hours: number) {
  if (hours < 1) return "dưới 1 giờ";
  if (hours < 48) return `${Math.floor(hours)} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}

export default async function Page() {
  const viewer = await requirePermission("registration.manage");
  const term = await getRegistrationTargetTerm();
  const [periods, allSections, summary, unregistered, queue] = await Promise.all([
    getRegistrationPeriods(term.id),
    getClassSections(term.id),
    getRegistrationSummary(term.id),
    getUnregisteredStudents(term.id),
    getRegistrationQueueStatus(),
  ]);
  const sections = allSections.filter((section) => inScope(viewer, section.faculty));
  const active = periods.filter((period) => period.state === "open" || period.state === "closing");
  const pending = unregistered.filter((student) => inScope(viewer, student.faculty));

  const open = sections.filter((section) => section.status === "open");
  const capacity = open.reduce((sum, section) => sum + section.capacity, 0);
  const enrolled = open.reduce((sum, section) => sum + section.enrolled, 0);

  return (
    <>
      <PageHeader
        title="Theo dõi đăng ký"
        description={
          <>
            {term.name}. Số liệu cập nhật theo thời gian thực trong đợt đăng ký; lớp đủ chỗ cân nhắc mở thêm, lớp dưới sĩ số tối thiểu cân nhắc hủy. Thời gian và
            hạn mức của từng đợt sửa ở <Link href="/administrator/terms">Học kỳ và đợt đăng ký</Link>.
          </>
        }
      />
      <div className="flex flex-col gap-4 sm:gap-6">
        {active.length === 0 ? (
          <SectionCard flush>
            <EmptyState illustration="calendar" title="Không có đợt đăng ký đang mở" description="Số liệu dưới đây là kết quả của các đợt đã đóng." />
          </SectionCard>
        ) : (
          <div className={`grid gap-3 ${active.length > 1 ? "md:grid-cols-2" : ""}`}>
            {active.map((period) => (
              <SectionCard key={period.id} title={period.name} extra={<StatusTag status={REGISTRATION_PERIOD_STATE[period.state]} />}>
                <div className="flex flex-col gap-3">
                  <span className="text-xs text-muted tabular-nums">
                    Đóng sau {hoursText(period.hoursLeft)}, lúc {formatDateTime(period.closesAt)}
                  </span>
                  <div className="flex items-center gap-3">
                    <MeterBar value={period.registeredStudents} max={period.eligibleStudents} label={`Đã đăng ký ${period.name}`} />
                    <span className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold">{period.registeredStudents}</span>/{period.eligibleStudents} sinh viên
                    </span>
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Chỗ đã đăng ký" value={`${capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0}%`} hint={`${enrolled}/${capacity} chỗ`} />
          <StatTile label="Lớp đã đủ chỗ" value={open.filter((section) => section.isFull).length} hint="Cân nhắc mở thêm lớp" tone={open.some((section) => section.isFull) ? "warning" : undefined} />
          <StatTile label="Lớp chưa mở" value={sections.filter((section) => section.status === "draft").length} hint="Đang ở trạng thái nháp" />
          <StatTile label="Sinh viên chưa đăng ký" value={pending.length} hint="Trong các đợt đang mở" tone={pending.length > 0 ? "warning" : undefined} />
          <StatTile
            label="Hàng đợi giờ cao điểm"
            value={queue ? queue.waiting.toLocaleString("vi-VN") : "Không có"}
            hint={
              queue
                ? `${queue.activeSessions}/${queue.sessionLimit} phiên, chờ trung bình ${queue.averageWaitSeconds} giây, cao nhất hôm nay ${queue.peakWaitingToday.toLocaleString("vi-VN")}`
                : "Chỉ bật khi có đợt đang mở"
            }
          />
        </div>
        <SectionCard title="Lớp cần xử lý">
          <RegistrationMonitorSections sections={sections} />
        </SectionCard>
        <SectionCard title="Sinh viên chưa đăng ký">
          <RegistrationMonitorStudents students={pending} />
        </SectionCard>
        <SectionCard title="Tỉ lệ lấp đầy theo khoa">
          <RegistrationReport summaries={summary.filter((row) => inScope(viewer, row.faculty))} />
        </SectionCard>
      </div>
    </>
  );
}
