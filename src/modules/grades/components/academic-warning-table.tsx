"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { formatPoint, WARNING_LEVEL, WARNING_STATUS } from "@/modules/grades/grades.constant";
import type { AcademicWarning, WarningStatus } from "@/modules/grades/grades.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";

type AcademicWarningTableProps = {
  warnings: AcademicWarning[];
  studentHrefBase: string;
  showFaculty?: boolean;
};

const NEXT_STATUS: Partial<Record<WarningStatus, { status: WarningStatus; label: string; done: string }>> = {
  new: { status: "notified", label: "Gửi thông báo", done: "Đã gửi thông báo cảnh báo tới email sinh viên" },
  notified: { status: "resolved", label: "Ghi nhận đã gặp", done: "Đã ghi nhận buổi gặp sinh viên" },
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function AcademicWarningTable({ warnings, studentHrefBase, showFaculty = false }: AcademicWarningTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [statuses, setStatuses] = useState<Record<string, WarningStatus>>({});
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number>();
  const [status, setStatus] = useState<WarningStatus>();
  const [faculty, setFaculty] = useState<string>();

  const rows = useMemo(
    () => warnings.map((warning) => ({ ...warning, status: statuses[warning.id] ?? warning.status })),
    [warnings, statuses],
  );
  const faculties = useMemo(() => [...new Set(warnings.map((warning) => warning.faculty))], [warnings]);
  const filtered = rows.filter((row) => {
    const needle = normalize(query.trim());
    if (needle && !normalize(`${row.fullName} ${row.studentCode} ${row.className}`).includes(needle)) return false;
    if (level && row.level !== level) return false;
    if (status && row.status !== status) return false;
    if (faculty && row.faculty !== faculty) return false;
    return true;
  });

  const advance = (row: AcademicWarning) => {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setStatuses((current) => ({ ...current, [row.id]: next.status }));
    messageApi.success(`${next.done}: ${row.fullName}`);
  };

  const emptyText = (
    <EmptyState
      illustration="search"
      title={warnings.length === 0 ? "Không có sinh viên bị cảnh báo" : "Không có sinh viên khớp bộ lọc"}
      description={warnings.length === 0 ? "Học kỳ gần nhất không có sinh viên dưới ngưỡng học vụ." : "Thử bỏ bớt điều kiện lọc."}
    />
  );

  const columns: TableColumnsType<AcademicWarning> = [
    {
      title: "Sinh viên",
      key: "student",
      fixed: "left",
      width: 220,
      render: (_, row) => (
        <Link href={`${studentHrefBase}${row.studentId}`} className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="text-xs text-muted">{row.studentCode}</span>
        </Link>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 110, render: (value: string) => <span className="text-xs">{value}</span> },
    ...(showFaculty ? [{ title: "Khoa", dataIndex: "faculty", width: 200 }] : []),
    {
      title: "CPA",
      dataIndex: "cpa4",
      width: 72,
      align: "right",
      sorter: (a, b) => a.cpa4 - b.cpa4,
      render: (value: number) => <span className="tabular-nums">{formatPoint(value)}</span>,
    },
    {
      title: "ĐTB kỳ",
      dataIndex: "termGpa4",
      width: 80,
      align: "right",
      render: (value: number) => <span className="tabular-nums">{formatPoint(value)}</span>,
    },
    {
      title: "Nợ TC",
      dataIndex: "failedCredits",
      width: 72,
      align: "right",
      sorter: (a, b) => a.failedCredits - b.failedCredits,
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: "Mức",
      dataIndex: "level",
      width: 130,
      render: (value: 1 | 2 | 3) => <StatusTag status={WARNING_LEVEL[value]} />,
    },
    {
      title: "Lý do",
      dataIndex: "reasons",
      width: 220,
      render: (reasons: string[]) => (
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ),
    },
    {
      title: "Xử lý",
      key: "status",
      width: 180,
      render: (_, row) => {
        const next = NEXT_STATUS[row.status];
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusTag status={WARNING_STATUS[row.status]} />
            {next && (
              <Button size="small" onClick={() => advance(row)}>
                {next.label}
              </Button>
            )}
          </div>
        );
      },
    },
    {
      title: "Ngày lập",
      dataIndex: "createdAt",
      width: 96,
      render: (value: string) => <span className="text-xs text-muted tabular-nums">{formatDate(value)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap gap-2">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên, mã sinh viên hoặc lớp"
          aria-label="Tìm sinh viên"
          className="w-full sm:w-72"
        />
        <Select
          allowClear
          value={level}
          onChange={setLevel}
          placeholder="Mọi mức"
          aria-label="Mức cảnh báo"
          options={([1, 2, 3] as const).map((value) => ({ value, label: WARNING_LEVEL[value].label }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        <Select
          allowClear
          value={status}
          onChange={setStatus}
          placeholder="Mọi trạng thái"
          aria-label="Trạng thái xử lý"
          options={(Object.keys(WARNING_STATUS) as WarningStatus[]).map((value) => ({ value, label: WARNING_STATUS[value].label }))}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        {showFaculty && (
          <Select
            allowClear
            value={faculty}
            onChange={setFaculty}
            placeholder="Mọi khoa"
            aria-label="Khoa"
            options={faculties.map((value) => ({ value, label: value }))}
            className="w-full sm:w-60"
          />
        )}
      </div>
      <Table
        rowKey="id"
        size={showFaculty ? "small" : "middle"}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: showFaculty ? 1380 : 1180 }}
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{ emptyText }}
        className="hidden md:block"
      />
      {filtered.length === 0 ? (
        <Card size="small" className="md:hidden">
          {emptyText}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2 md:hidden">
          {filtered.map((row) => {
            const next = NEXT_STATUS[row.status];
            return (
              <li key={row.id}>
                <Card size="small" classNames={{ body: "flex flex-col gap-2" }}>
                  <span className="flex items-start justify-between gap-2">
                    <Link href={`${studentHrefBase}${row.studentId}`} className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.fullName}</span>
                      <span className="text-xs text-muted">
                        {row.studentCode} · {row.className}
                      </span>
                    </Link>
                    <StatusTag status={WARNING_LEVEL[row.level]} />
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    CPA {formatPoint(row.cpa4)} · ĐTB kỳ {formatPoint(row.termGpa4)} · Nợ {row.failedCredits} TC
                  </span>
                  <ul className="flex flex-col gap-0.5 text-xs text-muted">
                    {row.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusTag status={WARNING_STATUS[row.status]} />
                    {next && (
                      <Button size="small" onClick={() => advance(row)} className="ml-auto">
                        {next.label}
                      </Button>
                    )}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
