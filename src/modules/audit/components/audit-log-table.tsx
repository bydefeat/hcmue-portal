"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, DatePicker, Input, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { AUDIT_ACTION, AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_LABEL, AUDIT_ENTITY_OPTIONS } from "@/modules/audit/audit.constant";
import type { AuditAction, AuditEntityType, AuditEntry, AuditPage } from "@/modules/audit/audit.type";
import { AuditChanges } from "@/modules/audit/components/audit-changes";
import { paginationItemRender } from "@/shared/constants/antd.constant";

export type AuditFilters = { q?: string; actor?: string; action?: AuditAction; entityType?: AuditEntityType; entityId?: string; from?: string; to?: string };

// Lọc và phân trang ở server: mỗi thay đổi bộ lọc đổi tham số trên đường dẫn, trang tải lại đúng phần nhật ký cần xem.
export function AuditLogTable({ page, filters }: { page: AuditPage; filters: AuditFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [actor, setActor] = useState(filters.actor ?? "");

  const navigate = (next: AuditFilters & { page?: number }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, q, actor, page: undefined, ...next })) {
      if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
    }
    startTransition(() => router.push(`${pathname}${params.size > 0 ? `?${params}` : ""}`));
  };

  const columns: TableColumnsType<AuditEntry> = [
    { title: "Thời điểm", dataIndex: "at", width: 140, responsive: ["md"], render: (value: string) => <span className="text-xs tabular-nums">{formatDateTime(value)}</span> },
    {
      title: "Người thực hiện",
      key: "actor",
      width: 200,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.actorName}</span>
          <span className="truncate text-xs text-muted">{row.actorRole}</span>
        </span>
      ),
    },
    { title: "Thao tác", dataIndex: "action", width: 110, responsive: ["md"], render: (value: AuditAction) => <StatusTag status={AUDIT_ACTION[value]} /> },
    {
      title: "Đối tượng",
      key: "entity",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <Button type="link" size="small" className="h-auto justify-start p-0 text-left whitespace-normal" onClick={() => navigate({ entityType: row.entityType, entityId: row.entityId })}>
            {row.entityLabel}
          </Button>
          <span className="text-xs text-muted">{AUDIT_ENTITY_LABEL[row.entityType]}</span>
          <span className="mt-1 flex flex-col items-start gap-1 md:hidden">
            <StatusTag status={AUDIT_ACTION[row.action]} />
            <span className="text-xs text-muted tabular-nums">
              {row.actorName} · {formatDateTime(row.at)}
            </span>
            <span className="text-sm text-pretty">{row.summary}</span>
            {row.changes.length > 0 && <AuditChanges changes={row.changes} />}
          </span>
        </span>
      ),
    },
    {
      title: "Nội dung",
      key: "summary",
      width: 320,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex flex-col gap-1">
          <span className="text-pretty">{row.summary}</span>
          {row.changes.length > 0 && <AuditChanges changes={row.changes} />}
        </span>
      ),
    },
    { title: "IP", dataIndex: "ip", width: 110, responsive: ["xxl"], render: (value: string) => <span className="text-xs text-muted">{value}</span> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input
          allowClear
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onPressEnter={() => navigate({ q })}
          onClear={() => navigate({ q: "" })}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Đối tượng, nội dung"
          aria-label="Tìm trong nhật ký"
          className="col-span-2 w-full sm:w-64"
        />
        <Input
          allowClear
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          onPressEnter={() => navigate({ actor })}
          onClear={() => navigate({ actor: "" })}
          placeholder="Người thực hiện"
          aria-label="Người thực hiện"
          className="col-span-2 w-full sm:w-52"
        />
        <Select allowClear value={filters.action} onChange={(value) => navigate({ action: value })} placeholder="Mọi thao tác" aria-label="Thao tác" options={AUDIT_ACTION_OPTIONS} className="min-w-0 sm:w-40" />
        <Select
          allowClear
          value={filters.entityType}
          onChange={(value) => navigate({ entityType: value, entityId: undefined })}
          placeholder="Mọi đối tượng"
          aria-label="Loại đối tượng"
          options={AUDIT_ENTITY_OPTIONS}
          className="min-w-0 sm:w-44"
        />
        <DatePicker.RangePicker
          value={[filters.from ? dayjs(filters.from) : null, filters.to ? dayjs(filters.to) : null]}
          onChange={(value) => navigate({ from: value?.[0]?.format("YYYY-MM-DD"), to: value?.[1]?.format("YYYY-MM-DD") })}
          format="DD/MM/YYYY"
          placeholder={["Từ ngày", "Đến ngày"]}
          aria-label="Khoảng thời gian"
          className="col-span-2 w-full sm:w-64"
        />
        {filters.entityId && (
          <Button className="col-span-2" onClick={() => navigate({ entityId: undefined })}>
            Bỏ lọc theo một đối tượng
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={isPending}
        columns={columns}
        dataSource={page.entries}
        scroll={{ x: "max-content" }}
        pagination={{
          itemRender: paginationItemRender,
          current: page.page,
          pageSize: page.pageSize,
          total: page.total,
          showSizeChanger: false,
          hideOnSinglePage: true,
          showTotal: (total) => `${total} bản ghi`,
          onChange: (next) => navigate({ page: next }),
        }}
        locale={{ emptyText: <EmptyState illustration="search" title="Không có bản ghi khớp bộ lọc" description="Thử mở rộng khoảng thời gian hoặc bỏ bớt điều kiện." /> }}
      />
    </div>
  );
}
