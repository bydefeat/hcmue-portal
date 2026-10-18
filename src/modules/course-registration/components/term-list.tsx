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
  { title: "Mã học kỳ", dataIndex: "code", width: 120, render: (code: string) => <span className="font-mono text-xs">{code}</span> },
  {
    title: "Học kỳ",
    dataIndex: "name",
    width: 260,
    render: (name: string, row) => (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        {row.isCurrent && <StatusTag status={CURRENT} />}
        {row.isRegistrationTarget && <StatusTag status={TARGET} />}
      </span>
    ),
  },
  {
    title: "Thời gian",
    key: "time",
    width: 200,
    render: (_, row) => (
      <span className="tabular-nums">
        {formatDate(row.startDate)} đến {formatDate(row.endDate)}
      </span>
    ),
  },
  {
    title: "Số tuần",
    key: "weeks",
    width: 80,
    align: "right",
    render: (_, row) => <span className="tabular-nums">{Math.round(dayjs(row.endDate).diff(row.startDate, "day") / 7)}</span>,
  },
  {
    title: "Lớp học phần",
    dataIndex: "sectionCount",
    width: 110,
    align: "right",
    render: (value: number) => <span className="tabular-nums">{value}</span>,
  },
  {
    title: "Đợt đăng ký",
    dataIndex: "periodCount",
    width: 110,
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
      scroll={{ x: 900 }}
      rowClassName={(row) => (row.isCurrent || row.isRegistrationTarget ? "" : "text-muted")}
    />
  );
}
