import type { Metadata } from "next";
import Link from "next/link";
import { Tabs } from "antd";
import { PageHeader } from "@/shared/components/ui/page-header";
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

export const metadata: Metadata = { title: "Thống kê học vụ" };

export default async function Page() {
  await requirePermission("reports.view");
  const [standings, currentTerm, targetTerm] = await Promise.all([getStandingSummary(), getCurrentTerm(), getRegistrationTargetTerm()]);
  const [currentRegistration, targetRegistration] = await Promise.all([
    getRegistrationSummary(currentTerm.id),
    getRegistrationSummary(targetTerm.id),
  ]);

  const total = standings.reduce((sum, entry) => sum + entry.total, 0);
  const averageCpa = total > 0 ? standings.reduce((sum, entry) => sum + entry.averageCpa * entry.total, 0) / total : 0;
  const topCount = standings.reduce((sum, entry) => sum + entry.counts.excellent + entry.counts["very-good"], 0);
  const warnings = standings.reduce((sum, entry) => sum + entry.warnings, 0);
  const targetSeats = targetRegistration.reduce((sum, entry) => sum + entry.capacity, 0);
  const targetEnrolled = targetRegistration.reduce((sum, entry) => sum + entry.enrolled, 0);

  return (
    <>
      <PageHeader
        title="Thống kê học vụ"
        description="Xếp loại tính theo CPA thang 4 đến hết học kỳ 2, năm học 2025-2026, không gồm khóa 48 đã xét tốt nghiệp."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sinh viên được xếp loại" value={total.toLocaleString("vi-VN")} hint={`${standings.length} khoa`} />
        <StatTile label="CPA trung bình" value={formatPoint(averageCpa)} hint="Thang 4" />
        <StatTile label="Giỏi và xuất sắc" value={`${total > 0 ? Math.round((topCount / total) * 100) : 0}%`} hint={`${topCount} sinh viên`} />
        <StatTile
          label="Bị cảnh báo học vụ"
          value={warnings}
          hint="Xem danh sách và xử lý"
          tone={warnings > 0 ? "warning" : undefined}
          href="/administrator/reports/academic-warnings"
        />
      </div>

      <section className="mb-8 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Xếp loại học lực theo khoa</h2>
        <StandingReport summaries={standings} />
      </section>

      <section className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Đăng ký học phần theo khoa</h2>
          <Link href="/administrator/class-sections" className="text-sm">
            Xem lớp học phần
          </Link>
        </div>
        <p className="text-sm text-muted tabular-nums">
          {targetTerm.name}: {targetEnrolled.toLocaleString("vi-VN")}/{targetSeats.toLocaleString("vi-VN")} chỗ đã có người đăng ký.
        </p>
        <Tabs
          defaultActiveKey={targetTerm.id}
          items={[
            { key: targetTerm.id, label: `${targetTerm.shortName}, đang đăng ký`, children: <RegistrationReport summaries={targetRegistration} /> },
            { key: currentTerm.id, label: `${currentTerm.shortName}, đang học`, children: <RegistrationReport summaries={currentRegistration} /> },
          ]}
        />
      </section>
    </>
  );
}
