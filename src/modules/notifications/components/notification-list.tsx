"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, message, Segmented, Select } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/shared/libs/date.lib";
import { markNotificationsRead } from "@/modules/notifications/notifications.action";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import type { AppNotification, NotificationKind } from "@/modules/notifications/notifications.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type View = "all" | "unread";

export function NotificationList({ notifications }: { notifications: AppNotification[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [isPending, startTransition] = useTransition();
  const [readIds, setReadIds] = useState<string[]>([]);
  const [view, setView] = useState<View>("all");
  const [kind, setKind] = useState<NotificationKind>();
  const isRead = (item: AppNotification) => item.isRead || readIds.includes(item.id);
  const unread = notifications.filter((item) => !isRead(item)).length;
  const kinds = [...new Set(notifications.map((item) => item.kind))];
  const visible = notifications.filter((item) => (view === "all" || !isRead(item)) && (!kind || item.kind === kind));

  // Hiện đã đọc ngay, lưu xong thì lấy danh sách id DB trả về; lỗi thì trả lại trạng thái cũ.
  const markRead = (ids: string[], notify: boolean) => {
    const unreadIds = ids.filter((id) => !readIds.includes(id) && !notifications.find((item) => item.id === id)?.isRead);
    if (unreadIds.length === 0) return;
    setReadIds((current) => [...current, ...unreadIds]);
    startTransition(async () => {
      const result = await markNotificationsRead({ ids: unreadIds }).catch(() => null);
      if (!result?.ok) {
        setReadIds((current) => current.filter((id) => !unreadIds.includes(id)));
        if (notify) messageApi.error(result?.message ?? "Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      setReadIds((current) => [...new Set([...current, ...result.data])]);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "unread", label: `Chưa đọc (${unread})` },
          ]}
        />
        <Select
          allowClear
          value={kind}
          onChange={setKind}
          placeholder="Mọi loại"
          aria-label="Loại thông báo"
          options={kinds.map((value) => ({ value, label: NOTIFICATION_KIND_LABEL[value] }))}
          className="w-40"
        />
        {unread > 0 && (
          <Button className="ml-auto" loading={isPending} onClick={() => markRead(notifications.map((item) => item.id), true)}>
            Đánh dấu đã đọc hết
          </Button>
        )}
      </div>
      <SectionCard flush>
        {visible.length === 0 ? (
          <EmptyState
            title={view === "unread" ? "Đã đọc hết thông báo" : "Chưa có thông báo"}
            description={view === "unread" ? "Thông báo mới về hạn chót, đơn từ và điểm sẽ hiện ở đây." : undefined}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong">
            {visible.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => markRead([item.id], false)}
                  className="flex gap-3 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:px-5"
                >
                  <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${isRead(item) ? "bg-transparent" : "bg-primary"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={`text-pretty ${isRead(item) ? "" : "font-medium"}`}>{item.title}</span>
                    <span className="text-sm text-pretty text-muted">{item.body}</span>
                    <span className="text-xs text-muted">
                      {NOTIFICATION_KIND_LABEL[item.kind]} · <span title={formatDateTime(item.createdAt)}>{formatRelative(item.createdAt)}</span>
                      {!isRead(item) && <span className="sr-only">, chưa đọc</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
