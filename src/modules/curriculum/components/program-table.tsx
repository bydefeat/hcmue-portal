"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDate } from "@/shared/libs/date.lib";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { PROGRAM_STATUS, PROGRAM_STATUS_OPTIONS } from "@/modules/curriculum/curriculum.constant";
import type { ProgramFormValues, ProgramStatus, ProgramSummary } from "@/modules/curriculum/curriculum.type";
import { ProgramFormDrawer } from "@/modules/curriculum/components/program-form-drawer";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

function cohortText(cohorts: number[]) {
  if (cohorts.length === 0) return "";
  const sorted = [...cohorts].toSorted((a, b) => a - b);
  return sorted.length > 1 ? `K${sorted[0]} đến K${sorted.at(-1)}` : `K${sorted[0]}`;
}

export function ProgramTable({ programs, header }: { programs: ProgramSummary[]; header: { title: string; description?: React.ReactNode } }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(programs);
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [status, setStatus] = useState<ProgramStatus>();
  const [editing, setEditing] = useState<ProgramSummary | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const faculties = [...new Set(programs.map((program) => program.faculty))];
  const needle = normalizeSearch(query.trim());
  const filtered = rows.filter((row) => {
    if (needle && !normalizeSearch(`${row.name} ${row.code}`).includes(needle)) return false;
    if (faculty && row.faculty !== faculty) return false;
    if (status && row.status !== status) return false;
    return true;
  });

  const openForm = (program: ProgramSummary | null) => {
    setEditing(program);
    setIsOpen(true);
  };

  const submit = (values: ProgramFormValues) => {
    const major = MOCK_MAJORS.find((entry) => entry.code === values.majorCode);
    const updatedAt = new Date().toISOString();
    if (editing) {
      setRows((current) => current.map((row) => (row.id === editing.id ? { ...row, ...values, faculty: major?.faculty ?? row.faculty, updatedAt } : row)));
      messageApi.success(`Đã lưu chương trình ${values.name}`);
    } else {
      const created: ProgramSummary = { ...values, id: `ctdt-moi-${Date.now()}`, faculty: major?.faculty ?? "", updatedAt, courseCount: 0 };
      setRows((current) => [created, ...current]);
      messageApi.success(`Đã thêm chương trình ${values.name}. Mở chương trình để xây dựng khung học phần.`);
    }
    setIsOpen(false);
  };

  const columns: TableColumnsType<ProgramSummary> = [
    {
      title: "Chương trình",
      key: "name",
      width: 260,
      render: (_, row) => (
        <Link href={`/administrator/programs/${row.id}`} className="flex min-w-0 flex-col">
          <span className="font-medium text-pretty">{row.name}</span>
          <span className="text-xs text-muted">{row.code}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={PROGRAM_STATUS[row.status]} />
            {row.totalCredits} tín chỉ
          </span>
        </Link>
      ),
    },
    { title: "Khoa", dataIndex: "faculty", width: 180, responsive: ["md"] },
    { title: "Văn bằng", dataIndex: "degree", width: 120, responsive: ["xl"] },
    {
      title: <span className="whitespace-nowrap">Tín chỉ</span>,
      dataIndex: "totalCredits",
      width: 96,
      responsive: ["md"],
      align: "right",
      sorter: (a, b) => a.totalCredits - b.totalCredits,
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: <span className="whitespace-nowrap">Số học phần</span>,
      dataIndex: "courseCount",
      width: 120,
      responsive: ["lg"],
      align: "right",
      render: (value: number) =>
        value > 0 ? <span className="tabular-nums">{value}</span> : <span className="text-amber-700">Chưa có khung</span>,
    },
    { title: "Khóa áp dụng", dataIndex: "cohorts", width: 110, responsive: ["lg"], render: (value: number[]) => <span className="tabular-nums">{cohortText(value)}</span> },
    { title: "Trạng thái", dataIndex: "status", width: 130, responsive: ["md"], render: (value: ProgramStatus) => <StatusTag status={PROGRAM_STATUS[value]} /> },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      width: 100,
      responsive: ["xxl"],
      render: (value: string) => <span className="text-xs text-muted tabular-nums">{formatDate(value)}</span>,
    },
    {
      title: "",
      key: "actions",
      width: 80,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="text" icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => openForm(row)} aria-label={`Sửa ${row.name}`}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <PageHeader
        {...header}
        actions={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => openForm(null)}>
            Thêm chương trình
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Tên chương trình hoặc mã ngành"
            aria-label="Tìm chương trình"
            className="col-span-2 w-full sm:w-72"
          />
          <Select
            allowClear
            value={faculty}
            onChange={setFaculty}
            placeholder="Mọi khoa"
            aria-label="Khoa"
            options={faculties.map((value) => ({ value, label: value }))}
            className="min-w-0 sm:w-60"
          />
          <Select
            allowClear
            value={status}
            onChange={setStatus}
            placeholder="Mọi trạng thái"
            aria-label="Trạng thái"
            options={PROGRAM_STATUS_OPTIONS}
            className="min-w-0 sm:w-44"
          />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} chương trình` }}
          locale={{
            emptyText: (
              <EmptyState
                illustration="search"
                title={rows.length === 0 ? "Chưa có chương trình đào tạo" : "Không có chương trình khớp bộ lọc"}
                description={rows.length === 0 ? "Thêm chương trình đầu tiên để mở lớp học phần theo khung." : "Thử bỏ bớt điều kiện lọc."}
              />
            ),
          }}
        />
        <ProgramFormDrawer open={isOpen} program={editing} onClose={() => setIsOpen(false)} onSubmit={submit} />
      </div>
    </>
  );
}
