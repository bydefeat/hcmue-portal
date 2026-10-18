"use client";

import { useMemo, useState } from "react";
import { DatePicker, Input, Select, Table, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { History, Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";
import { AUDIT_ACTION, AUDIT_ENTITY_LABEL } from "../audit.constant";
import type { AuditAction, AuditEntityType, AuditEntry } from "../audit.type";
import { AuditChanges } from "./audit-changes";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditAction>();
  const [entity, setEntity] = useState<AuditEntityType>();
  const [actor, setActor] = useState<string>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const actors = useMemo(() => [...new Set(entries.map((entry) => entry.actorName))], [entries]);
  const actions = useMemo(() => [...new Set(entries.map((entry) => entry.action))], [entries]);
  const entities = useMemo(() => [...new Set(entries.map((entry) => entry.entityType))], [entries]);

  const filtered = entries.filter((entry) => {
    const needle = normalize(query.trim());
    if (needle && !normalize(`${entry.entityLabel} ${entry.summary} ${entry.actorName}`).includes(needle)) return false;
    if (action && entry.action !== action) return false;
    if (entity && entry.entityType !== entity) return false;
    if (actor && entry.actorName !== actor) return false;
    if (range?.[0] && dayjs(entry.at).isBefore(range[0].startOf("day"))) return false;
    if (range?.[1] && dayjs(entry.at).isAfter(range[1].endOf("day"))) return false;
    return true;
  });

  const columns: TableColumnsType<AuditEntry> = [
    { title: "Thời điểm", dataIndex: "at", width: 150, render: (value: string) => <span className="text-xs tabular-nums">{formatDateTime(value)}</span> },
    {
      title: "Người thực hiện",
      key: "actor",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.actorName}</span>
          <span className="truncate text-xs text-muted">{row.actorRole}</span>
        </span>
      ),
    },
    { title: "Thao tác", dataIndex: "action", width: 120, render: (value: AuditAction) => <StatusTag status={AUDIT_ACTION[value]} /> },
    {
      title: "Đối tượng",
      key: "entity",
      width: 240,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.entityLabel}</span>
          <span className="text-xs text-muted">{AUDIT_ENTITY_LABEL[row.entityType]}</span>
        </span>
      ),
    },
    { title: "Nội dung", dataIndex: "summary", render: (value: string) => <span className="text-pretty">{value}</span> },
    { title: "IP", dataIndex: "ip", width: 110, render: (value: string) => <span className="font-mono text-xs text-muted">{value}</span> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Đối tượng, nội dung"
          aria-label="Tìm trong nhật ký"
          className="w-full sm:w-64"
        />
        <Select allowClear value={action} onChange={setAction} placeholder="Mọi thao tác" aria-label="Thao tác" options={actions.map((value) => ({ value, label: AUDIT_ACTION[value].label }))} className="min-w-0 flex-1 sm:w-40 sm:flex-none" />
        <Select allowClear value={entity} onChange={setEntity} placeholder="Mọi đối tượng" aria-label="Loại đối tượng" options={entities.map((value) => ({ value, label: AUDIT_ENTITY_LABEL[value] }))} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
        <Select allowClear showSearch={{ optionFilterProp: "label" }} value={actor} onChange={setActor} placeholder="Mọi người thực hiện" aria-label="Người thực hiện" options={actors.map((value) => ({ value, label: value }))} className="w-full sm:w-52" />
        <DatePicker.RangePicker value={range} onChange={(value) => setRange(value)} format="DD/MM/YYYY" aria-label="Khoảng thời gian" className="w-full sm:w-64" />
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1100 }}
        expandable={{
          expandedRowRender: (row) => (
            <div className="py-1 pl-2">
              <AuditChanges changes={row.changes} />
            </div>
          ),
          rowExpandable: (row) => row.changes.length > 0,
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} bản ghi` }}
        locale={{ emptyText: <EmptyState icon={History} title="Không có bản ghi khớp bộ lọc" description="Thử mở rộng khoảng thời gian hoặc bỏ bớt điều kiện." /> }}
      />
    </div>
  );
}
