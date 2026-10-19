"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import type { Role, RoleAssignment } from "@/modules/access/access.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

type RoleAssignmentTableProps = {
  assignments: RoleAssignment[];
  roles: Role[];
  faculties: string[];
  currentUserId: string;
  viewerName: string;
};

type GrantValues = { userName: string; userCode: string; unit: string; roleId: string; faculty?: string };

export function RoleAssignmentTable({ assignments, roles, faculties, currentUserId, viewerName }: RoleAssignmentTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(assignments);
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState<string>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<GrantValues>();
  const selectedRoleId = Form.useWatch("roleId", form);
  const needsFaculty = roles.find((role) => role.id === selectedRoleId)?.scope === "faculty";

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? id;

  const filtered = rows.filter((row) => {
    const needle = normalizeSearch(query.trim());
    if (needle && !normalizeSearch(`${row.userName} ${row.userCode} ${row.unit}`).includes(needle)) return false;
    return !roleId || row.roleId === roleId;
  });

  const revoke = (row: RoleAssignment) =>
    modal.confirm({
      title: `Thu hồi quyền của ${row.userName}?`,
      content: `${row.userName} mất vai trò ${roleName(row.roleId)} ngay lập tức và bị đăng xuất khỏi cổng quản trị. Thao tác được ghi vào nhật ký.`,
      okText: "Thu hồi",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        setRows((current) => current.filter((entry) => entry.id !== row.id));
        messageApi.success(`Đã thu hồi vai trò ${roleName(row.roleId)} của ${row.userName}`);
      },
    });

  const grant = (values: GrantValues) => {
    const role = roles.find((entry) => entry.id === values.roleId)!;
    setRows((current) => [
      {
        id: `pq-moi-${current.length + 1}`,
        userId: `cb-moi-${current.length + 1}`,
        userName: values.userName.trim(),
        userCode: values.userCode.trim().toUpperCase(),
        unit: values.unit.trim(),
        roleId: values.roleId,
        faculty: role.scope === "faculty" ? (values.faculty ?? null) : null,
        grantedAt: dayjs().toISOString(),
        grantedBy: viewerName,
      },
      ...current,
    ]);
    messageApi.success(`Đã cấp vai trò ${role.name} cho ${values.userName}`);
    setOpen(false);
  };

  const columns: TableColumnsType<RoleAssignment> = [
    {
      title: "Cán bộ",
      key: "user",
      width: 240,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.userName}</span>
          <span className="truncate text-xs text-muted">
            {row.userCode} · {row.unit}
          </span>
        </span>
      ),
    },
    {
      title: "Vai trò",
      key: "role",
      width: 260,
      render: (_, row) => (
        <span className="flex flex-col">
          {roleName(row.roleId)}
          {row.faculty && <span className="text-xs text-muted">{row.faculty}</span>}
        </span>
      ),
    },
    {
      title: "Cấp ngày",
      key: "granted",
      width: 180,
      render: (_, row) => (
        <span className="flex flex-col text-xs text-muted">
          <span className="tabular-nums">{formatDate(row.grantedAt)}</span>
          <span>bởi {row.grantedBy}</span>
        </span>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      render: (_, row) => (
        <div className="flex justify-end gap-2">
          <Button size="small" danger disabled={row.userId === currentUserId} onClick={() => revoke(row)}>
            Thu hồi
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="flex flex-wrap gap-2">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên, mã cán bộ, đơn vị"
          aria-label="Tìm cán bộ"
          className="w-full sm:w-64"
        />
        <Select allowClear value={roleId} onChange={setRoleId} placeholder="Mọi vai trò" aria-label="Vai trò" options={roles.map((role) => ({ value: role.id, label: role.name }))} className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
        <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setOpen(true)} className="sm:ml-auto">
          Cấp quyền
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 900 }}
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: <EmptyState illustration="search" title="Không có cán bộ khớp bộ lọc" /> }}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size={480}
        mask={{ closable: false }}
        destroyOnHidden
        title="Cấp quyền cho cán bộ"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="primary" onClick={() => form.submit()}>
              Cấp quyền
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={grant}>
          <Form.Item name="userName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Form.Item name="userCode" label="Mã cán bộ" rules={[{ required: true, whitespace: true, message: "Chưa nhập mã cán bộ" }]}>
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item name="unit" label="Đơn vị công tác" rules={[{ required: true, whitespace: true, message: "Chưa nhập đơn vị" }]}>
              <Input autoComplete="off" />
            </Form.Item>
          </div>
          <Form.Item name="roleId" label="Vai trò" rules={[{ required: true, message: "Chưa chọn vai trò" }]}>
            <Select options={roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
          {needsFaculty && (
            <Form.Item name="faculty" label="Khoa được quản lý" rules={[{ required: true, message: "Vai trò theo khoa cần chọn khoa" }]}>
              <Select options={faculties.map((value) => ({ value, label: value }))} />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
