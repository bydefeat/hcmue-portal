"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Drawer, Form, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Pen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { toFormFields } from "@/shared/libs/form.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { ACCOUNT_STATUS_OPTIONS } from "@/modules/users/users.constant";
import { OFFICIAL_EMAIL_MESSAGE } from "@/modules/users/users.rule";
import { updateStaffMember } from "@/modules/users/users.action";
import type { AccountState, AccountStatus as AccountStatusValue, StaffMember } from "@/modules/users/users.type";
import { AccountBulkActions } from "@/modules/users/components/account-bulk-actions";
import { AccountStatus } from "@/modules/users/components/account-status";
import { StaffCreateButton, type StaffRoleOption } from "@/modules/users/components/staff-create-button";

export type StaffRow = StaffMember & { account: AccountState };

type EditValues = { fullName: string; unit: string; email: string };

type StaffTableProps = {
  staff: StaffRow[];
  roles: StaffRoleOption[];
  faculties: string[];
  currentUserId: string;
  header: { title: string; description?: React.ReactNode };
};

export function StaffTable({ staff, roles, faculties, currentUserId, header }: StaffTableProps) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(staff);
  const [query, setQuery] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatusValue>();
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form] = Form.useForm<EditValues>();
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    if (editing) form.setFieldsValue({ fullName: editing.fullName, unit: editing.unit, email: editing.email });
  }, [editing, form]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return rows.filter((row) => {
      if (needle && !normalizeSearch(`${row.fullName} ${row.code} ${row.unit} ${row.email}`).includes(needle)) return false;
      return !accountStatus || row.account.status === accountStatus;
    });
  }, [rows, query, accountStatus]);

  const save = (values: EditValues) =>
    startSaving(async () => {
      if (!editing) return;
      const result = await updateStaffMember(editing.id, values).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setRows((current) => current.map((row) => (row.id === result.data.id ? { ...result.data, account: row.account } : row)));
      messageApi.success(`Đã lưu thông tin ${result.data.fullName}`);
      setEditing(null);
    });

  const columns: TableColumnsType<StaffRow> = [
    { title: "Mã cán bộ", dataIndex: "code", width: 110, responsive: ["md"], render: (code: string) => <span className="text-xs">{code}</span> },
    {
      title: "Họ và tên",
      key: "name",
      width: 240,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">{row.email}</span>
          <span className="mt-1 text-xs text-muted md:hidden">
            {row.code} · {row.unit}
          </span>
        </span>
      ),
    },
    { title: "Đơn vị", dataIndex: "unit", width: 200, responsive: ["md"] },
    {
      title: "Vai trò quản trị",
      dataIndex: "roles",
      width: 240,
      responsive: ["lg"],
      render: (value: string[]) => (value.length > 0 ? <span className="text-sm text-pretty">{value.join(", ")}</span> : <span className="text-sm text-muted">Chưa có vai trò</span>),
    },
    { title: "Tài khoản", key: "account", width: 130, render: (_, row) => <AccountStatus account={row.account} /> },
    {
      title: "",
      key: "actions",
      width: 80,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="text" aria-label={`Sửa ${row.fullName}`} icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => setEditing(row)}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <PageHeader {...header} actions={<StaffCreateButton roles={roles} faculties={faculties} onCreated={() => router.refresh()} />} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Tên, mã cán bộ, đơn vị, email"
            aria-label="Tìm cán bộ"
            className="w-full sm:w-72"
          />
          <Select allowClear value={accountStatus} onChange={setAccountStatus} placeholder="Mọi tài khoản" aria-label="Tài khoản" options={ACCOUNT_STATUS_OPTIONS} className="w-full sm:w-40" />
        </div>
        {selectedIds.length > 0 && (
          <Card size="small" classNames={{ body: "flex flex-wrap items-center gap-3 py-2" }}>
            <span className="text-sm tabular-nums">Đã chọn {selectedIds.length} cán bộ</span>
            <AccountBulkActions
              kind="staff"
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
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: setSelectedIds,
            // Không tự khóa tài khoản của mình (server cũng chặn).
            getCheckboxProps: (row) => ({ disabled: row.userId === currentUserId }),
          }}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} cán bộ` }}
          locale={{ emptyText: <EmptyState illustration="search" title="Không có cán bộ khớp bộ lọc" description="Thử tìm theo mã cán bộ hoặc bỏ bớt điều kiện lọc." /> }}
        />
        <Drawer
          open={editing !== null}
          onClose={() => setEditing(null)}
          size={480}
          mask={{ closable: false }}
          destroyOnHidden
          title={editing ? `Sửa thông tin ${editing.fullName}` : ""}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(null)}>Hủy</Button>
              <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
                Lưu thay đổi
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={save}>
            <Form.Item label="Mã cán bộ" extra="Mã cán bộ là tên đăng nhập, không đổi sau khi tạo.">
              <Input value={editing?.code} disabled />
            </Form.Item>
            <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị" rules={[{ required: true, whitespace: true, message: "Chưa nhập đơn vị" }]}>
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email công vụ"
              extra="Nhận mã kích hoạt và đặt lại mật khẩu; đổi ở đây thì đổi luôn email của tài khoản."
              rules={[
                { required: true, message: "Chưa nhập email" },
                { pattern: /^[^@\s]+@hcmue\.edu\.vn$/i, message: OFFICIAL_EMAIL_MESSAGE },
              ]}
            >
              <Input autoComplete="off" inputMode="email" />
            </Form.Item>
          </Form>
        </Drawer>
      </div>
    </>
  );
}
