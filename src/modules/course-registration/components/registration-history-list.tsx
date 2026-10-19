import { History } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { REGISTRATION_EVENT } from "../course-registration.constant";
import type { RegistrationEvent } from "../course-registration.type";

export function RegistrationHistoryList({ events }: { events: RegistrationEvent[] }) {
  if (events.length === 0) {
    return <EmptyState icon={History} title="Chưa có thao tác đăng ký" description="Mỗi lần đăng ký, hủy, đổi lớp hay được xếp từ danh sách chờ sẽ ghi lại ở đây." />;
  }
  return (
    <ol className="flex flex-col divide-y divide-border-strong">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
          <span className="shrink-0 text-xs text-muted tabular-nums sm:w-36">{formatDateTime(event.at)}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <StatusTag status={REGISTRATION_EVENT[event.kind]} />
              <span className="text-xs">{event.sectionCode}</span>
              <span className="min-w-0 text-sm text-pretty">{event.courseName}</span>
            </span>
            <span className="text-xs text-pretty text-muted">{event.note}</span>
            <span className="text-xs text-muted">
              {event.actor} · {event.channel}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
