"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Dropdown, Input, message, Select, Table, type TableColumnsType } from "antd";
import { FileArrowIn, Magnifier, Pen, Plus, UserSearch } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { COHORT_OPTIONS, FACULTY_OPTIONS, STUDENT_STATUS, STUDENT_STATUS_OPTIONS } from "../users.constant";
import type { Student, StudentFormValues, StudentStatus } from "../users.type";
import { StudentFormDrawer } from "./student-form-drawer";
import { StudentImportModal } from "./student-import-modal";

export type StudentRow = Student & {
  cpa4: number | null;
  standingLabel: string | null;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function toStudent(values: StudentFormValues, base?: StudentRow): StudentRow {
  const major = MOCK_MAJORS.find((entry) => entry.code === values.majorCode)!;
  return {
    id: base?.id ?? `sv-new-${values.code}`,
    hometown: base?.hometown ?? "",
    cpa4: base?.cpa4 ?? null,
    standingLabel: base?.standingLabel ?? null,
    ...values,
    faculty: major.faculty,
    majorName: major.name,
  };
}

export function StudentTable({ students }: { students: StudentRow[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(students);
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [cohort, setCohort] = useState<number>();
  const [status, setStatus] = useState<StudentStatus>();
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return rows.filter((row) => {
      if (needle && !normalize(`${row.fullName} ${row.code} ${row.className}`).includes(needle)) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (cohort && row.cohort !== cohort) return false;
      if (status && row.status !== status) return false;
      return true;
    });
  }, [rows, query, faculty, cohort, status]);

  const openCreate = () => {
    setEditing(null);
    setIsDrawerOpen(true);
  };

  const openEdit = (row: StudentRow) => {
    setEditing(row);
    setIsDrawerOpen(true);
  };

  const handleSubmit = (values: StudentFormValues) => {
    if (editing) {
      setRows((current) => current.map((row) => (row.id === editing.id ? toStudent(values, editing) : row)));
      messageApi.success(`Đã lưu hồ sơ ${values.fullName}`);
    } else {
      if (rows.some((row) => row.code === values.code)) {
        messageApi.error(`Mã ${values.code} đã thuộc về sinh viên khác. Kiểm tra lại mã trên giấy báo nhập học.`);
        return;
      }
      setRows((current) => [toStudent(values), ...current]);
      messageApi.success(`Đã thêm ${values.fullName} vào lớp ${values.className}`);
    }
    setIsDrawerOpen(false);
  };

  const changeStatus = (next: StudentStatus) => {
    const ids = new Set(selectedIds);
    setRows((current) => current.map((row) => (ids.has(row.id) ? { ...row, status: next } : row)));
    messageApi.success(`Đã chuyển ${ids.size} sinh viên sang "${STUDENT_STATUS[next].label}"`);
    setSelectedIds([]);
  };

  const columns: TableColumnsType<StudentRow> = [
    {
      title: "Mã SV",
      dataIndex: "code",
      width: 120,
      fixed: "left",
      render: (code: string) => <span className="text-xs">{code}</span>,
    },
    {
      title: "Họ và tên",
      key: "name",
      width: 240,
      render: (_, row) => (
        <Link href={`/administrator/users/students/${row.id}`} className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">{row.email}</span>
        </Link>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, render: (value: string) => <span className="text-xs">{value}</span> },
    { title: "Ngành", dataIndex: "majorName", width: 190 },
    {
      title: "CPA",
      dataIndex: "cpa4",
      width: 130,
      align: "right",
      sorter: (a, b) => (a.cpa4 ?? -1) - (b.cpa4 ?? -1),
      render: (value: number | null, row) =>
        value === null ? (
          <span className="text-xs text-muted">Chưa có</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="tabular-nums">{value.toFixed(2).replace(".", ",")}</span>
            <span className="text-xs text-muted">{row.standingLabel}</span>
          </span>
        ),
    },
    {
      title: "Tình trạng",
      dataIndex: "status",
      width: 140,
      render: (value: StudentStatus) => (value === "studying" ? <span className="text-muted">Đang học</span> : <StatusTag status={STUDENT_STATUS[value]} />),
    },
    {
      title: "",
      key: "actions",
      width: 56,
      align: "right",
      render: (_, row) => <Button type="text" aria-label={`Sửa ${row.fullName}`} icon={<Pen size={16} aria-hidden className="text-zinc-500" />} onClick={() => openEdit(row)} />,
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
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={FACULTY_OPTIONS} className="w-full sm:w-60" />
        <Select allowClear value={cohort} onChange={setCohort} placeholder="Mọi khóa" aria-label="Khóa" options={COHORT_OPTIONS} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
        <Select
          allowClear
          value={status}
          onChange={setStatus}
          placeholder="Mọi tình trạng"
          aria-label="Tình trạng"
          options={STUDENT_STATUS_OPTIONS}
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        <div className="flex w-full gap-2 lg:ml-auto lg:w-auto">
          <Button icon={<FileArrowIn size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsImportOpen(true)}>
            Nhập từ Excel
          </Button>
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
            Thêm sinh viên
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <Card size="small" classNames={{ body: "flex flex-wrap items-center gap-3 py-2" }}>
          <span className="text-sm tabular-nums">Đã chọn {selectedIds.length} sinh viên</span>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: STUDENT_STATUS_OPTIONS.map((option) => ({ key: option.value, label: option.label })),
              onClick: ({ key }) => changeStatus(key as StudentStatus),
            }}
          >
            <Button size="small">Đổi trạng thái</Button>
          </Dropdown>
          <Button size="small" type="text" onClick={() => setSelectedIds([])}>
            Bỏ chọn
          </Button>
        </Card>
      )}

      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={filtered}
        rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} sinh viên` }}
        locale={{
          emptyText: (
            <EmptyState
              icon={UserSearch}
              title="Không có sinh viên khớp bộ lọc"
              description="Thử tìm theo mã sinh viên hoặc bỏ bớt điều kiện lọc."
            />
          ),
        }}
      />

      <StudentFormDrawer open={isDrawerOpen} student={editing} onClose={() => setIsDrawerOpen(false)} onSubmit={handleSubmit} />

      <StudentImportModal
        open={isImportOpen}
        existingCodes={rows.map((row) => row.code)}
        onClose={() => setIsImportOpen(false)}
        onImport={(values) => {
          setRows((current) => [...values.map((value) => toStudent(value)), ...current]);
          messageApi.success(`Đã nhập ${values.length} sinh viên mới`);
        }}
      />
    </div>
  );
}
