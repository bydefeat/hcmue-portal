"use client";

import { Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import type { FacultyRegistrationSummary } from "@/modules/course-registration/course-registration.type";

function fillRate(row: FacultyRegistrationSummary) {
  return row.capacity > 0 ? Math.round((row.enrolled / row.capacity) * 100) : 0;
}

const COLUMNS: TableColumnsType<FacultyRegistrationSummary> = [
  { title: "Khoa", dataIndex: "faculty", width: 170 },
  { title: <span className="whitespace-nowrap">Lớp mở</span>, dataIndex: "sections", width: 96, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: <span className="whitespace-nowrap">Lớp đủ chỗ</span>,
    dataIndex: "fullSections",
    width: 120,
    responsive: ["md"],
    align: "right",
    render: (value: number) => <span className="tabular-nums">{value}</span>,
  },
  {
    title: "Đăng ký / chỉ tiêu",
    key: "seats",
    width: 150,
    responsive: ["md"],
    align: "right",
    render: (_, row) => (
      <span className="tabular-nums">
        {row.enrolled.toLocaleString("vi-VN")}/{row.capacity.toLocaleString("vi-VN")}
      </span>
    ),
  },
  {
    title: "Tỉ lệ lấp đầy",
    key: "rate",
    width: 160,
    sorter: (a, b) => fillRate(a) - fillRate(b),
    render: (_, row) => {
      const rate = fillRate(row);
      return (
        <span className="flex items-center gap-3">
          <MeterBar value={row.enrolled} max={row.capacity} tone={rate >= 95 ? "warning" : "primary"} label={`Tỉ lệ lấp đầy ${row.faculty}`} />
          <span className="w-10 shrink-0 text-right tabular-nums">{rate}%</span>
        </span>
      );
    },
  },
];

export function RegistrationReport({ summaries }: { summaries: FacultyRegistrationSummary[] }) {
  return (
    <Table
      rowKey="faculty"
      size="small"
      columns={COLUMNS}
      dataSource={summaries}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{
        emptyText: <EmptyState illustration="chart" title="Chưa có lớp mở đăng ký" description="Số liệu hiện khi Phòng Đào tạo mở lớp học phần cho học kỳ này." />,
      }}
    />
  );
}
