"use client";

import { Table, Tooltip, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatPoint, STANDING_SCALE } from "@/modules/grades/grades.constant";
import type { AcademicStanding, FacultyStandingSummary } from "@/modules/grades/grades.type";

const SEGMENT_CLASS: Record<AcademicStanding, string> = {
  excellent: "bg-green-700",
  "very-good": "bg-green-500",
  good: "bg-lime-400",
  average: "bg-amber-300",
  weak: "bg-orange-500",
  poor: "bg-red-600",
};

function DistributionBar({ counts, total }: { counts: Record<AcademicStanding, number>; total: number }) {
  const summary = STANDING_SCALE.map((step) => `${step.label} ${counts[step.standing]}`).join(", ");
  return (
    <div role="img" aria-label={summary} className="flex h-3 w-full min-w-40 gap-0.5 overflow-hidden rounded-full bg-border-strong">
      {STANDING_SCALE.filter((step) => counts[step.standing] > 0).map((step) => (
        <Tooltip key={step.standing} title={`${step.label}: ${counts[step.standing]} sinh viên (${Math.round((counts[step.standing] / total) * 100)}%)`}>
          <div className={`h-full ${SEGMENT_CLASS[step.standing]}`} style={{ width: `${(counts[step.standing] / total) * 100}%` }} />
        </Tooltip>
      ))}
    </div>
  );
}

export function StandingLegend({ summaries }: { summaries: FacultyStandingSummary[] }) {
  const totals = STANDING_SCALE.map((step) => ({ ...step, count: summaries.reduce((sum, entry) => sum + entry.counts[step.standing], 0) }));
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {totals.map((step) => (
        <li key={step.standing} className="flex items-center gap-2">
          <span aria-hidden className={`size-2.5 rounded-sm ${SEGMENT_CLASS[step.standing]}`} />
          <span>{step.label}</span>
          <span className="text-muted tabular-nums">{step.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function StandingReport({ summaries }: { summaries: FacultyStandingSummary[] }) {
  const columns: TableColumnsType<FacultyStandingSummary> = [
    { title: "Khoa", dataIndex: "faculty", width: 200 },
    { title: <span className="whitespace-nowrap">Sinh viên</span>, dataIndex: "total", width: 100, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{value}</span> },
    {
      title: <span className="whitespace-nowrap">CPA TB</span>,
      dataIndex: "averageCpa",
      width: 100,
      align: "right",
      sorter: (a, b) => a.averageCpa - b.averageCpa,
      render: (value: number) => <span className="tabular-nums">{formatPoint(value)}</span>,
    },
    {
      title: "Phân bố xếp loại",
      key: "distribution",
      width: 300,
      responsive: ["md"],
      render: (_, row) => <DistributionBar counts={row.counts} total={row.total} />,
    },
    {
      title: <span className="whitespace-nowrap">Giỏi trở lên</span>,
      key: "top",
      width: 120,
      responsive: ["lg"],
      align: "right",
      render: (_, row) => (
        <span className="tabular-nums">{Math.round(((row.counts.excellent + row.counts["very-good"]) / row.total) * 100)}%</span>
      ),
    },
    {
      title: <span className="whitespace-nowrap">Cảnh báo</span>,
      dataIndex: "warnings",
      width: 100,
      responsive: ["md"],
      align: "right",
      sorter: (a, b) => a.warnings - b.warnings,
      render: (value: number) => <span className={`tabular-nums ${value > 0 ? "font-medium text-amber-700" : ""}`}>{value}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <StandingLegend summaries={summaries} />
      <Table
        rowKey="faculty"
        size="small"
        columns={columns}
        dataSource={summaries}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: <EmptyState illustration="chart" title="Chưa có dữ liệu xếp loại" description="Kết quả học tập sẽ được tổng hợp khi học kỳ đầu tiên kết thúc." /> }}
      />
    </div>
  );
}
