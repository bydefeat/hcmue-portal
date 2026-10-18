"use client";

import { Table, type TableColumnsType } from "antd";
import { ChartColumn } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import type { FacultyRegistrationSummary } from "../course-registration.type";

function fillRate(row: FacultyRegistrationSummary) {
  return row.capacity > 0 ? Math.round((row.enrolled / row.capacity) * 100) : 0;
}

const COLUMNS: TableColumnsType<FacultyRegistrationSummary> = [
  { title: "Khoa", dataIndex: "faculty", width: 220, fixed: "left" },
  { title: "Lớp mở", dataIndex: "sections", width: 88, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: "Lớp đủ chỗ",
    dataIndex: "fullSections",
    width: 100,
    align: "right",
    render: (value: number) => <span className="tabular-nums">{value}</span>,
  },
  {
    title: "Đăng ký / chỉ tiêu",
    key: "seats",
    width: 140,
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
    width: 240,
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
      scroll={{ x: 790 }}
      locale={{
        emptyText: <EmptyState icon={ChartColumn} title="Chưa có lớp mở đăng ký" description="Số liệu hiện khi Phòng Đào tạo mở lớp học phần cho học kỳ này." />,
      }}
    />
  );
}
