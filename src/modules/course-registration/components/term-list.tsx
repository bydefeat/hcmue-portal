"use client";

import { Table, type TableColumnsType } from "antd";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import type { StatusMeta } from "@/shared/constants/status.constant";
import type { Term } from "../course-registration.type";

export type TermRow = Term & {
  sectionCount: number;
  periodCount: number;
};

const CURRENT: StatusMeta = { label: "Đang diễn ra", tone: "success" };
const TARGET: StatusMeta = { label: "Đang nhận đăng ký", tone: "warning" };

const COLUMNS: TableColumnsType<TermRow> = [
  { title: "Mã học kỳ", dataIndex: "code", width: 120, responsive: ["md"], render: (code: string) => <span className="text-xs">{code}</span> },
  {
    title: "Học kỳ",
    dataIndex: "name",
    width: 260,
    render: (name: string, row) => (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          {row.isCurrent && <StatusTag status={CURRENT} />}
          {row.isRegistrationTarget && <StatusTag status={TARGET} />}
        </span>
        <span className="text-xs text-muted tabular-nums md:hidden">
          {formatDate(row.startDate)} đến {formatDate(row.endDate)}
        </span>
      </span>
    ),
  },
  {
    title: "Thời gian",
    key: "time",
    width: 200,
    responsive: ["md"],
    render: (_, row) => (
      <span className="tabular-nums">
        {formatDate(row.startDate)} đến {formatDate(row.endDate)}
      </span>
    ),
  },
  {
    title: <span className="whitespace-nowrap">Số tuần</span>,
    key: "weeks",
    width: 90,
    responsive: ["lg"],
    align: "right",
    render: (_, row) => <span className="tabular-nums">{Math.round(dayjs(row.endDate).diff(row.startDate, "day") / 7)}</span>,
  },
  {
    title: <span className="whitespace-nowrap">Lớp học phần</span>,
    dataIndex: "sectionCount",
    width: 120,
    responsive: ["md"],
    align: "right",
    render: (value: number) => <span className="tabular-nums">{value}</span>,
  },
  {
    title: <span className="whitespace-nowrap">Đợt đăng ký</span>,
    dataIndex: "periodCount",
    width: 120,
    responsive: ["md"],
    align: "right",
    render: (value: number) => <span className="tabular-nums">{value}</span>,
  },
];

export function TermList({ terms }: { terms: TermRow[] }) {
  const ordered = [...terms].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <Table
      rowKey="id"
      size="small"
      columns={COLUMNS}
      dataSource={ordered}
      pagination={false}
      scroll={{ x: "max-content" }}
      rowClassName={(row) => (row.isCurrent || row.isRegistrationTarget ? "" : "text-muted")}
    />
  );
}
