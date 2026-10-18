"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, message } from "antd";
import { Lock } from "defeat-icons-react";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { PERMISSION_GROUPS, SCOPE_LABEL } from "../access.constant";
import type { Permission, Role } from "../access.type";

export type RoleRow = Role & { memberCount: number };

export function RolePermissionMatrix({ roles }: { roles: RoleRow[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(roles);
  const [selectedId, setSelectedId] = useState(roles[0]?.id);
  const [draft, setDraft] = useState<Permission[]>(roles[0]?.permissions ?? []);
  const selected = rows.find((role) => role.id === selectedId);
  const isDirty = selected ? JSON.stringify([...draft].sort()) !== JSON.stringify([...selected.permissions].sort()) : false;

  const select = (role: RoleRow) => {
    setSelectedId(role.id);
    setDraft(role.permissions);
  };

  const toggle = (permission: Permission, checked: boolean) =>
    setDraft((current) => (checked ? [...current, permission] : current.filter((entry) => entry !== permission)));

  const save = () => {
    if (!selected) return;
    setRows((current) => current.map((role) => (role.id === selected.id ? { ...role, permissions: draft } : role)));
    messageApi.success(`Đã lưu quyền cho vai trò ${selected.name}, áp dụng từ lần đăng nhập kế tiếp của ${selected.memberCount} người`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {contextHolder}
      <ul className="flex flex-col gap-1 rounded-xl border border-border-strong bg-surface p-2">
        {rows.map((role) => (
          <li key={role.id}>
            <button
              type="button"
              onClick={() => select(role)}
              aria-current={role.id === selectedId}
              className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors ${role.id === selectedId ? "bg-item-hover" : "hover:bg-item-hover"}`}
            >
              <span className={`flex items-center gap-2 ${role.id === selectedId ? "font-semibold" : "font-medium"}`}>
                {role.name}
                {role.isSystem && <Lock size={14} aria-label="Vai trò hệ thống" className="text-muted" />}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {SCOPE_LABEL[role.scope]} · {role.memberCount} người · {role.permissions.length} quyền
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-strong bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{selected.name}</h3>
            <p className="text-sm text-pretty text-muted">{selected.description}</p>
          </div>
          {selected.isSystem ? (
            <Alert type="info" showIcon title="Vai trò hệ thống không sửa được quyền" description="Tạo vai trò mới nếu cần một tổ hợp quyền khác." />
          ) : (
            selected.scope === "faculty" && (
              <Alert type="info" showIcon title="Vai trò theo khoa" description="Người được cấp chỉ thấy sinh viên, lớp, bảng điểm và đơn từ của khoa được chỉ định khi cấp quyền." />
            )
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.label} className="flex flex-col gap-2">
                <legend className="mb-1 text-xs font-medium text-muted">{group.label}</legend>
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission.key}
                    checked={draft.includes(permission.key)}
                    disabled={selected.isSystem}
                    onChange={(event) => toggle(permission.key, event.target.checked)}
                  >
                    {permission.label}
                  </Checkbox>
                ))}
              </fieldset>
            ))}
          </div>
          {!selected.isSystem && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-strong pt-4">
              {isDirty && <StatusTag status={{ label: "Chưa lưu", tone: "warning" }} />}
              <Button disabled={!isDirty} onClick={() => setDraft(selected.permissions)}>
                Hoàn tác
              </Button>
              <Button type="primary" disabled={!isDirty || draft.length === 0} onClick={save}>
                Lưu quyền
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
