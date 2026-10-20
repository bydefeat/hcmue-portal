"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { ACCOUNT_STATUS_OPTIONS, facultyOptions, LECTURER_ROLES, LECTURER_STATUS } from "@/modules/users/users.constant";
import type { AccountState, AccountStatus as AccountStatusValue, Lecturer, LecturerFormValues } from "@/modules/users/users.type";
import { AccountBulkActions } from "@/modules/users/components/account-bulk-actions";
import { AccountStatus } from "@/modules/users/components/account-status";
import { LecturerFormDrawer } from "@/modules/users/components/lecturer-form-drawer";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { saveLecturer } from "@/modules/users/users.action";

const ROLE_LABEL = Object.fromEntries(LECTURER_ROLES.map((role) => [role.value, role.label]));

export type LecturerRow = Lecturer & { account: AccountState };

export function LecturerTable({
  lecturers,
  faculties,
  initialQuery = "",
  header,
  canManage,
}: {
  lecturers: LecturerRow[];
  // Có quyền quản lý giảng viên: thêm, sửa, thao tác tài khoản. Không có thì bảng chỉ để xem.
  canManage: boolean;
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
  const [accountStatus, setAccountStatus] = useState<AccountStatusValue>();
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [editing, setEditing] = useState<LecturerRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const facultyFilterOptions = useMemo(() => facultyOptions(faculties), [faculties]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return rows.filter((row) => {
      if (needle && !normalizeSearch(`${row.fullName} ${row.code} ${row.email}`).includes(needle)) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (role && !row.roles.includes(role)) return false;
      if (accountStatus && row.account.status !== accountStatus) return false;
      return true;
    });
  }, [rows, query, faculty, role, accountStatus]);

  const handleSubmit = async (values: LecturerFormValues, options: { provisionAccount: boolean }) => {
    const result = await saveLecturer(editing?.id ?? null, values, options).catch(() => null);
    if (!result) {
      messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
      return undefined;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return result.fieldErrors;
    }
    const saved: LecturerRow = { ...result.data.profile, account: result.data.account };
    const mail = result.data.mail;
    setRows((current) => (editing ? current.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...current]));
    const mailNote = mail ? `; đã gửi thư kích hoạt tới ${saved.email}` : "";
    messageApi.success(editing ? `Đã lưu thông tin ${saved.displayName}` : `Đã thêm ${saved.displayName}${mailNote}`);
    setIsDrawerOpen(false);
    return undefined;
  };

  const columns: TableColumnsType<LecturerRow> = [
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
    { title: "Tài khoản", key: "account", width: 130, responsive: ["md"], render: (_, row) => <AccountStatus account={row.account} /> },
  ];
  if (canManage) {
    columns.push({
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
    });
  }

  return (
    <>
      {contextHolder}
      <PageHeader
        {...header}
        actions={
          canManage ? (
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
          ) : undefined
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
          <Select allowClear value={role} onChange={setRole} placeholder="Mọi vai trò" aria-label="Vai trò" options={LECTURER_ROLES} className="w-full sm:w-48" />
          <Select
            allowClear
            value={accountStatus}
            onChange={setAccountStatus}
            placeholder="Mọi tài khoản"
            aria-label="Tài khoản"
            options={ACCOUNT_STATUS_OPTIONS}
            className="w-full sm:w-40"
          />
        </div>
        {canManage && selectedIds.length > 0 && (
          <Card size="small" classNames={{ body: "flex flex-wrap items-center gap-3 py-2" }}>
            <span className="text-sm tabular-nums">Đã chọn {selectedIds.length} giảng viên</span>
            <AccountBulkActions
              kind="lecturer"
              selectedIds={selectedIds.map(String)}
              onUpdated={(accounts) => setRows((current) => current.map((row) => (accounts[row.id] ? { ...row, account: accounts[row.id] } : row)))}
            />
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
          rowSelection={canManage ? { selectedRowKeys: selectedIds, onChange: setSelectedIds } : undefined}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} giảng viên` }}
          locale={{ emptyText: <EmptyState illustration="search" title="Không có giảng viên khớp bộ lọc" description="Thử tìm theo mã giảng viên hoặc bỏ bớt điều kiện lọc." /> }}
        />
        <LecturerFormDrawer open={isDrawerOpen} lecturer={editing} faculties={faculties} onClose={() => setIsDrawerOpen(false)} onSubmit={handleSubmit} />
      </div>
    </>
  );
}
