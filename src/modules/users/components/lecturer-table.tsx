"use client";

import { useMemo, useState } from "react";
import { Button, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Pen, Plus, UserSearch } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { FACULTY_OPTIONS, LECTURER_STATUS, USER_ROLES } from "../users.constant";
import type { Lecturer, LecturerFormValues } from "../users.type";
import { LecturerFormDrawer } from "./lecturer-form-drawer";

const ROLE_LABEL = Object.fromEntries(USER_ROLES.map((role) => [role.value, role.label]));

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function LecturerTable({ lecturers, initialQuery = "" }: { lecturers: Lecturer[]; initialQuery?: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(lecturers);
  const [query, setQuery] = useState(initialQuery);
  const [faculty, setFaculty] = useState<string>();
  const [role, setRole] = useState<string>();
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return rows.filter((row) => {
      if (needle && !normalize(`${row.fullName} ${row.code} ${row.email}`).includes(needle)) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (role && !row.roles.includes(role)) return false;
      return true;
    });
  }, [rows, query, faculty, role]);

  const handleSubmit = (values: LecturerFormValues) => {
    const next = (base?: Lecturer): Lecturer => ({
      id: base?.id ?? `gv-new-${values.code}`,
      gender: base?.gender ?? "female",
      ...values,
      displayName: `${values.title} ${values.fullName}`,
      isAdvisor: values.roles.includes("advisor"),
    });
    if (editing) {
      setRows((current) => current.map((row) => (row.id === editing.id ? next(editing) : row)));
      messageApi.success(`Đã lưu thông tin ${values.title} ${values.fullName}`);
    } else {
      setRows((current) => [next(), ...current]);
      messageApi.success(`Đã thêm ${values.title} ${values.fullName}, tài khoản được gửi tới ${values.email}`);
    }
    setIsDrawerOpen(false);
  };

  const columns: TableColumnsType<Lecturer> = [
    { title: "Mã GV", dataIndex: "code", width: 110, fixed: "left", render: (code: string) => <span className="font-mono text-xs">{code}</span> },
    {
      title: "Họ và tên",
      key: "name",
      width: 250,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.displayName}</span>
          <span className="truncate text-xs text-muted">{row.email}</span>
        </span>
      ),
    },
    { title: "Khoa", dataIndex: "faculty", width: 210 },
    {
      title: "Vai trò",
      dataIndex: "roles",
      width: 220,
      render: (roles: string[]) => <span className="text-sm">{roles.map((value) => ROLE_LABEL[value]).join(", ")}</span>,
    },
    { title: "Điện thoại", dataIndex: "phone", width: 120, render: (value: string) => <span className="tabular-nums">{value}</span> },
    {
      title: "Tình trạng",
      dataIndex: "status",
      width: 140,
      render: (value: Lecturer["status"]) => (value === "active" ? <span className="text-muted">Đang giảng dạy</span> : <StatusTag status={LECTURER_STATUS[value]} />),
    },
    {
      title: "",
      key: "actions",
      width: 56,
      align: "right",
      render: (_, row) => (
        <Button
          type="text"
          aria-label={`Sửa ${row.displayName}`}
          icon={<Pen size={16} aria-hidden />}
          onClick={() => {
            setEditing(row);
            setIsDrawerOpen(true);
          }}
        />
      ),
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
          placeholder="Tên, mã hoặc email"
          aria-label="Tìm giảng viên"
          className="w-full sm:w-72"
        />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={FACULTY_OPTIONS} className="w-full sm:w-60" />
        <Select allowClear value={role} onChange={setRole} placeholder="Mọi vai trò" aria-label="Vai trò" options={USER_ROLES} className="w-full sm:w-48" />
        <Button
          type="primary"
          icon={<Plus size={16} aria-hidden />}
          onClick={() => {
            setEditing(null);
            setIsDrawerOpen(true);
          }}
          className="lg:ml-auto"
        >
          Thêm giảng viên
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} giảng viên` }}
        locale={{ emptyText: <EmptyState icon={UserSearch} title="Không có giảng viên khớp bộ lọc" description="Thử tìm theo mã giảng viên hoặc bỏ bớt điều kiện lọc." /> }}
      />
      <LecturerFormDrawer open={isDrawerOpen} lecturer={editing} onClose={() => setIsDrawerOpen(false)} onSubmit={handleSubmit} />
    </div>
  );
}
