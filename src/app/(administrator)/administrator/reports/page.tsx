import type { Metadata } from "next";
import Link from "next/link";
import { Tabs } from "antd";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { RegistrationReport } from "@/modules/course-registration/components/registration-report";
import {
  getCurrentTerm,
  getRegistrationSummary,
  getRegistrationTargetTerm,
} from "@/modules/course-registration/course-registration.query";
import { StandingReport } from "@/modules/grades/components/standing-report";
import { formatPoint } from "@/modules/grades/grades.constant";
import { getStandingSummary } from "@/modules/grades/grades.query";
import { requirePermission } from "@/modules/access/access.query";
import { TABS_MORE } from "@/shared/constants/antd.constant";

export const metadata: Metadata = { title: "Thống kê học vụ" };

export default async function Page() {
  await requirePermission("reports.view");
  const [standings, currentTerm, targetTerm] = await Promise.all([getStandingSummary(), getCurrentTerm(), getRegistrationTargetTerm()]);
  const [currentRegistration, targetRegistration] = await Promise.all([
    getRegistrationSummary(currentTerm.id),
    getRegistrationSummary(targetTerm.id),
  ]);

  const total = standings.reduce((sum, entry) => sum + entry.total, 0);
  const unranked = standings.reduce((sum, entry) => sum + entry.unranked, 0);
  const averageCpa = total > 0 ? standings.reduce((sum, entry) => sum + entry.averageCpa * entry.total, 0) / total : 0;
  const topCount = standings.reduce((sum, entry) => sum + entry.counts.excellent + entry.counts["very-good"], 0);
  const warnings = standings.reduce((sum, entry) => sum + entry.warnings, 0);
  const targetSeats = targetRegistration.reduce((sum, entry) => sum + entry.capacity, 0);
  const targetEnrolled = targetRegistration.reduce((sum, entry) => sum + entry.enrolled, 0);

  return (
    <>
      <PageHeader
        title="Thống kê học vụ"
        description="Xếp loại theo CPA thang 4 (lần học cuối của mỗi học phần) và ngưỡng của quy chế đang áp dụng, tính đến hết học kỳ đã kết thúc gần nhất; không gồm sinh viên đã nghỉ, bảo lưu và các khóa đang xét tốt nghiệp."
      />
      <div className="flex flex-col gap-4 sm:gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Sinh viên được xếp loại" value={total.toLocaleString("vi-VN")} hint={unranked > 0 ? `${standings.length} khoa, ${unranked} chưa có điểm` : `${standings.length} khoa`} />
          <StatTile label="CPA trung bình" value={formatPoint(averageCpa)} hint="Thang 4" />
          <StatTile label="Giỏi và xuất sắc" value={`${total > 0 ? Math.round((topCount / total) * 100) : 0}%`} hint={`${topCount} sinh viên`} />
          <StatTile
            label="Đang bị cảnh báo học vụ"
            value={warnings}
            hint="Cảnh báo đã gửi, học kỳ gần nhất"
            tone={warnings > 0 ? "warning" : undefined}
            href="/administrator/reports/academic-warnings"
          />
        </div>

        <SectionCard title="Xếp loại học lực theo khoa">
          <StandingReport summaries={standings} />
        </SectionCard>

        <SectionCard title="Đăng ký học phần theo khoa" extra={<Link href="/administrator/class-sections">Xem lớp học phần</Link>}>
          <p className="text-sm text-muted tabular-nums">
            {targetTerm.name}: {targetEnrolled.toLocaleString("vi-VN")}/{targetSeats.toLocaleString("vi-VN")} chỗ đã có người đăng ký.
          </p>
          <Tabs
            more={TABS_MORE}
            defaultActiveKey={targetTerm.id}
            items={[
              { key: targetTerm.id, label: `${targetTerm.shortName}, đang đăng ký`, children: <RegistrationReport summaries={targetRegistration} /> },
              { key: currentTerm.id, label: `${currentTerm.shortName}, đang học`, children: <RegistrationReport summaries={currentRegistration} /> },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
