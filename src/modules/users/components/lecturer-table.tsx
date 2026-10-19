"use client";

import { useMemo, useState } from "react";
import { Button, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { facultyOptions, LECTURER_STATUS, USER_ROLES } from "@/modules/users/users.constant";
import type { Lecturer, LecturerFormValues } from "@/modules/users/users.type";
import { LecturerFormDrawer } from "@/modules/users/components/lecturer-form-drawer";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { saveLecturer } from "@/modules/users/users.action";

const ROLE_LABEL = Object.fromEntries(USER_ROLES.map((role) => [role.value, role.label]));

export function LecturerTable({
  lecturers,
  faculties,
  initialQuery = "",
  header,
}: {
  lecturers: Lecturer[];
  // Danh sách khoa đọc từ DB.
  faculties: string[];
  initialQuery?: string;
  header: { title: string; description?: React.ReactNode };
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(lecturers);
  const [query, setQuery] = useState(initialQuery);
  const [faculty, setFaculty] = useState<string>();
  const [role, setRole] = useState<string>();
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const facultyFilterOptions = useMemo(() => facultyOptions(faculties), [faculties]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return rows.filter((row) => {
      if (needle && !normalizeSearch(`${row.fullName} ${row.code} ${row.email}`).includes(needle)) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (role && !row.roles.includes(role)) return false;
      return true;
    });
  }, [rows, query, faculty, role]);

  const handleSubmit = async (values: LecturerFormValues) => {
    const result = await saveLecturer(editing?.id ?? null, values).catch(() => null);
    if (!result) {
      messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
      return undefined;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return result.fieldErrors;
    }
    const saved = result.data;
    setRows((current) => (editing ? current.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...current]));
    messageApi.success(editing ? `Đã lưu thông tin ${saved.displayName}` : `Đã thêm ${saved.displayName}`);
    setIsDrawerOpen(false);
    return undefined;
  };

  const columns: TableColumnsType<Lecturer> = [
    { title: "Mã GV", dataIndex: "code", width: 110, responsive: ["md"], render: (code: string) => <span className="text-xs">{code}</span> },
    {
      title: "Họ và tên",
      key: "name",
      width: 250,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.displayName}</span>
          <span className="truncate text-xs text-muted">{row.email}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted md:hidden">
            {row.code} · {row.faculty}
            {row.status !== "active" && <StatusTag status={LECTURER_STATUS[row.status]} />}
          </span>
        </span>
      ),
    },
    { title: "Khoa", dataIndex: "faculty", width: 210, responsive: ["md"] },
    {
      title: "Vai trò",
      dataIndex: "roles",
      width: 220,
      responsive: ["lg"],
      render: (roles: string[]) => <span className="text-sm">{roles.map((value) => ROLE_LABEL[value]).join(", ")}</span>,
    },
    { title: "Điện thoại", dataIndex: "phone", width: 120, responsive: ["lg"], render: (value: string) => <span className="tabular-nums">{value}</span> },
    {
      title: "Tình trạng",
      dataIndex: "status",
      width: 140,
      responsive: ["md"],
      render: (value: Lecturer["status"]) => (value === "active" ? <span className="text-muted">Đang giảng dạy</span> : <StatusTag status={LECTURER_STATUS[value]} />),
    },
    {
      title: "",
      key: "actions",
      width: 80,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          aria-label={`Sửa ${row.displayName}`}
          icon={<Pen size={14} aria-hidden className="text-zinc-500" />}
          onClick={() => {
            setEditing(row);
            setIsDrawerOpen(true);
          }}
        >
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
          <Button
            type="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setEditing(null);
              setIsDrawerOpen(true);
            }}
          >
            Thêm giảng viên
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
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
          <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={facultyFilterOptions} className="w-full sm:w-60" />
          <Select allowClear value={role} onChange={setRole} placeholder="Mọi vai trò" aria-label="Vai trò" options={USER_ROLES} className="w-full sm:w-48" />
        </div>
        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} giảng viên` }}
          locale={{ emptyText: <EmptyState illustration="search" title="Không có giảng viên khớp bộ lọc" description="Thử tìm theo mã giảng viên hoặc bỏ bớt điều kiện lọc." /> }}
        />
        <LecturerFormDrawer open={isDrawerOpen} lecturer={editing} faculties={faculties} onClose={() => setIsDrawerOpen(false)} onSubmit={handleSubmit} />
      </div>
    </>
  );
}
