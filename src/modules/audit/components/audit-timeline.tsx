"use client";

import { Timeline } from "antd";
import { History } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { AUDIT_ACTION } from "../audit.constant";
import type { AuditEntry } from "../audit.type";
import { AuditChanges } from "./audit-changes";

export function AuditTimeline({ entries, emptyText = "Chưa có thay đổi nào được ghi nhận." }: { entries: AuditEntry[]; emptyText?: string }) {
  if (entries.length === 0) return <EmptyState icon={History} title="Chưa có lịch sử" description={emptyText} />;
  return (
    <Timeline
      items={entries.map((entry) => ({
        key: entry.id,
        color: "gray",
        content: (
          <div className="flex flex-col gap-1 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={AUDIT_ACTION[entry.action]} />
              <span className="text-sm text-pretty">{entry.summary}</span>
            </div>
            <span className="text-xs text-muted tabular-nums">
              {entry.actorName} · {entry.actorRole} · {formatDateTime(entry.at)}
            </span>
            {entry.changes.length > 0 && <AuditChanges changes={entry.changes} />}
          </div>
        ),
      }))}
    />
  );
}
