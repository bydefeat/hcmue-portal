"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox, Input, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Users } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import type { Student } from "../users.type";

export type AdviseeRow = {
  student: Student;
  cpa4: number;
  earnedCredits: number;
  standingLabel: string;
  warning: StatusMeta | null;
  plan: StatusMeta | null;
  needsAttention: boolean;
};

type AdviseeTableProps = {
  rows: AdviseeRow[];
  studentHrefBase: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function AdviseeTable({ rows, studentHrefBase }: AdviseeTableProps) {
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState<string>();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const classNames = [...new Set(rows.map((row) => row.student.className))].sort();
  const needle = normalize(query.trim());
  const filtered = rows.filter(
    (row) =>
      (!needle || normalize(`${row.student.fullName} ${row.student.code}`).includes(needle)) &&
      (!className || row.student.className === className) &&
      (!onlyAttention || row.needsAttention),
  );

  const columns: TableColumnsType<AdviseeRow> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 230,
      fixed: "left",
      sorter: (a, b) => a.student.fullName.split(" ").at(-1)!.localeCompare(b.student.fullName.split(" ").at(-1)!, "vi"),
      render: (_, row) => (
        <Link href={`${studentHrefBase}${row.student.id}`} className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.student.fullName}</span>
          <span className="text-xs text-muted">{row.student.code}</span>
        </Link>
      ),
    },
    { title: "Lớp", key: "className", width: 130, render: (_, row) => <span className="text-xs">{row.student.className}</span> },
    {
      title: "CPA",
      dataIndex: "cpa4",
      width: 80,
      align: "right",
      sorter: (a, b) => a.cpa4 - b.cpa4,
      render: (value: number) => <span className="tabular-nums">{value.toFixed(2).replace(".", ",")}</span>,
    },
    { title: "Xếp loại", dataIndex: "standingLabel", width: 110 },
    {
      title: "Tín chỉ tích lũy",
      dataIndex: "earnedCredits",
      width: 120,
      align: "right",
      sorter: (a, b) => a.earnedCredits - b.earnedCredits,
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: "Cảnh báo",
      key: "warning",
      width: 150,
      render: (_, row) => (row.warning ? <StatusTag status={row.warning} /> : null),
    },
    {
      title: "Kế hoạch học tập",
      key: "plan",
      width: 140,
      render: (_, row) => (row.plan ? <StatusTag status={row.plan} /> : <span className="text-xs text-muted">Chưa lập</span>),
    },
    {
      title: "Liên hệ",
      key: "contact",
      width: 140,
      render: (_, row) => (
        <a href={`tel:${row.student.phone}`} className="text-sm tabular-nums">
          {row.student.phone}
        </a>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên hoặc mã sinh viên"
          aria-label="Tìm sinh viên"
          className="w-full sm:w-64"
        />
        <Select
          allowClear
          value={className}
          onChange={setClassName}
          placeholder="Mọi lớp"
          aria-label="Lớp"
          options={classNames.map((value) => ({ value, label: value }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        <Checkbox checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)}>
          Chỉ sinh viên cần chú ý
        </Checkbox>
      </div>
      <Table
        rowKey={(row) => row.student.id}
        size="middle"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 30, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{
          emptyText: (
            <EmptyState
              icon={Users}
              title={rows.length === 0 ? "Chưa được phân công lớp cố vấn" : "Không có sinh viên khớp bộ lọc"}
              description={rows.length === 0 ? "Phòng Đào tạo chưa giao lớp sinh hoạt nào cho bạn." : "Thử bỏ bớt điều kiện lọc."}
            />
          ),
        }}
      />
    </div>
  );
}
