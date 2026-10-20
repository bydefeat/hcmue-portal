"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Drawer, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatDate } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { grantRole, revokeRole } from "@/modules/access/access.action";
import { isPrivilegedRole } from "@/modules/access/access.rule";
import type { GrantCandidate, Role, RoleAssignment } from "@/modules/access/access.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

type RoleAssignmentTableProps = {
  assignments: RoleAssignment[];
  roles: Role[];
  faculties: string[];
  candidates: GrantCandidate[];
  currentUserId: string;
  viewerFaculty: string | null;
};

type GrantValues = { userId: string; roleId: string; faculty?: string };

export function RoleAssignmentTable({ assignments, roles, faculties, candidates, currentUserId, viewerFaculty }: RoleAssignmentTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(assignments);
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState<string>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<GrantValues>();
  const [isGranting, startGranting] = useTransition();
  const selectedRoleId = Form.useWatch("roleId", form);
  const needsFaculty = roles.find((role) => role.id === selectedRoleId)?.scope === "faculty";

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? id;
  // Người theo khoa chỉ cấp vai trò theo khoa không có quyền phân quyền, trong đúng khoa của mình.
  const grantableRoles = viewerFaculty === null ? roles : roles.filter((role) => role.scope === "faculty" && !isPrivilegedRole(role));
  const facultyChoices = viewerFaculty === null ? faculties : [viewerFaculty];

  const filtered = rows.filter((row) => {
    const needle = normalizeSearch(query.trim());
    if (needle && !normalizeSearch(`${row.userName} ${row.userCode} ${row.unit}`).includes(needle)) return false;
    return !roleId || row.roleId === roleId;
  });

  const revoke = (row: RoleAssignment) =>
    modal.confirm({
      title: `Thu hồi quyền của ${row.userName}?`,
      content: `${row.userName} mất vai trò ${roleName(row.roleId)} ngay lập tức. Hết vai trò quản trị thì không vào được cổng quản trị nữa.`,
      okText: "Thu hồi",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await revokeRole(row.id).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? "Chưa thu hồi được, kiểm tra kết nối rồi thử lại.");
          return;
        }
        setRows((current) => current.filter((entry) => entry.id !== row.id));
        messageApi.success(`Đã thu hồi vai trò ${roleName(row.roleId)} của ${row.userName}`);
      },
    });

  const grant = (values: GrantValues) =>
    startGranting(async () => {
      const result = await grantRole(values).catch(() => null);
      if (!result) {
        messageApi.error("Chưa cấp quyền được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const assignment = result.data;
      setRows((current) => [assignment, ...current]);
      messageApi.success(`Đã cấp vai trò ${roleName(assignment.roleId)} cho ${assignment.userName}`);
      setOpen(false);
    });

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
            <Button type="primary" loading={isGranting} onClick={() => form.submit()}>
              Cấp quyền
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={grant}>
          <Form.Item
            name="userId"
            label="Cán bộ"
            extra="Chỉ cán bộ, giảng viên đã có tài khoản đăng nhập."
            rules={[{ required: true, message: "Chưa chọn cán bộ" }]}
          >
            <Select
              showSearch={{ optionFilterProp: "label" }}
              placeholder="Tìm theo tên hoặc mã"
              options={candidates.map((candidate) => ({ value: candidate.userId, label: `${candidate.name} · ${candidate.code}${candidate.unit ? ` · ${candidate.unit}` : ""}` }))}
            />
          </Form.Item>
          <Form.Item name="roleId" label="Vai trò" rules={[{ required: true, message: "Chưa chọn vai trò" }]}>
            <Select options={grantableRoles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
          {needsFaculty && (
            <Form.Item name="faculty" label="Khoa được quản lý" rules={[{ required: true, message: "Vai trò theo khoa cần chọn khoa" }]}>
              <Select options={facultyChoices.map((value) => ({ value, label: value }))} />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
