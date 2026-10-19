"use client";

import { useMemo, useState } from "react";
import { Checkbox, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, UsersLink } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { COHORT_OPTIONS, FACULTY_OPTIONS } from "../users.constant";
import type { AdvisorAssignment, Lecturer } from "../users.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";

const UNASSIGNED = { label: "Chưa có cố vấn", tone: "warning" } as const;

type AdvisorAssignmentTableProps = {
  assignments: AdvisorAssignment[];
  lecturers: Pick<Lecturer, "id" | "displayName" | "faculty" | "status">[];
};

export function AdvisorAssignmentTable({ assignments, lecturers }: AdvisorAssignmentTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(assignments);
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [cohort, setCohort] = useState<number>();
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const classCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) if (row.advisorId) counts.set(row.advisorId, (counts.get(row.advisorId) ?? 0) + 1);
    return counts;
  }, [rows]);

  const filtered = rows
    .filter((row) => {
      if (query && !row.className.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (cohort && row.cohort !== cohort) return false;
      if (onlyUnassigned && row.advisorId) return false;
      return true;
    })
    .sort((a, b) => Number(Boolean(a.advisorId)) - Number(Boolean(b.advisorId)) || a.className.localeCompare(b.className));

  const unassignedCount = rows.filter((row) => !row.advisorId).length;

  const assign = (className: string, advisorId: string | null) => {
    const advisor = lecturers.find((lecturer) => lecturer.id === advisorId) ?? null;
    setRows((current) =>
      current.map((row) => (row.className === className ? { ...row, advisorId, advisorName: advisor?.displayName ?? null } : row)),
    );
    if (advisor) messageApi.success(`Đã phân công ${advisor.displayName} làm cố vấn lớp ${className}`);
    else messageApi.warning(`Lớp ${className} chưa có cố vấn, sinh viên sẽ không nộp được kế hoạch học tập`);
  };

  const advisorSelect = (row: AdvisorAssignment) => (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        allowClear
        value={row.advisorId ?? undefined}
        onChange={(value?: string) => assign(row.className, value ?? null)}
        placeholder="Chọn giảng viên"
        aria-label={`Cố vấn lớp ${row.className}`}
        showSearch={{ optionFilterProp: "label" }}
        options={lecturers
          .filter((lecturer) => lecturer.faculty === row.faculty)
          .map((lecturer) => ({
            value: lecturer.id,
            label: lecturer.displayName,
            disabled: lecturer.status === "on-leave",
            title: lecturer.status === "on-leave" ? "Đang nghỉ phép" : undefined,
          }))}
        optionRender={(option) => (
          <span className="flex items-center justify-between gap-2">
            <span className="truncate">{option.label}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {option.data.disabled ? "Nghỉ phép" : `${classCount.get(String(option.value)) ?? 0} lớp`}
            </span>
          </span>
        )}
        className="w-full min-w-44 sm:w-64"
      />
      {!row.advisorId && <StatusTag status={UNASSIGNED} />}
    </div>
  );

  const columns: TableColumnsType<AdvisorAssignment> = [
    {
      title: "Lớp",
      dataIndex: "className",
      width: 160,
      render: (value: string, row) => (
        <span className="flex flex-col">
          <span className="text-xs font-medium">{value}</span>
          <span className="text-xs text-muted tabular-nums md:hidden">
            K{row.cohort} · {row.studentCount} sinh viên
          </span>
          <span className="mt-2 md:hidden">{advisorSelect(row)}</span>
        </span>
      ),
    },
    { title: "Ngành", dataIndex: "majorName", width: 190, responsive: ["md"] },
    { title: "Khóa", dataIndex: "cohort", width: 80, responsive: ["md"], render: (value: number) => <span className="tabular-nums">K{value}</span> },
    { title: "Sĩ số", dataIndex: "studentCount", width: 80, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{value}</span> },
    {
      title: "Cố vấn học tập",
      key: "advisor",
      width: 300,
      responsive: ["md"],
      render: (_, row) => advisorSelect(row),
    },
    { title: "Khoa", dataIndex: "faculty", width: 210, responsive: ["xl"] },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên lớp, ví dụ 49.01.CNTT"
          aria-label="Tìm lớp"
          className="col-span-2 w-full sm:w-64"
        />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={FACULTY_OPTIONS} className="min-w-0 sm:w-60" />
        <Select allowClear value={cohort} onChange={setCohort} placeholder="Mọi khóa" aria-label="Khóa" options={COHORT_OPTIONS} className="min-w-0 sm:w-36" />
        <Checkbox className="col-span-2" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)}>
          Chỉ lớp chưa có cố vấn <span className="tabular-nums">({unassignedCount})</span>
        </Checkbox>
      </div>
      <Table
        rowKey="className"
        size="middle"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: "max-content" }}
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} lớp` }}
        locale={{
          emptyText: (
            <EmptyState
              icon={UsersLink}
              title={onlyUnassigned ? "Mọi lớp đã có cố vấn" : "Không có lớp khớp bộ lọc"}
              description={onlyUnassigned ? "Không còn lớp sinh hoạt nào cần phân công." : "Thử bỏ bớt điều kiện lọc."}
            />
          ),
        }}
      />
    </div>
  );
}
