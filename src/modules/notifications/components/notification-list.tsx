"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, message, Segmented, Select } from "antd";
import { Trash } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/shared/libs/date.lib";
import { deleteNotifications, loadNotifications, markAllNotificationsRead, markNotificationsRead } from "@/modules/notifications/notifications.action";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import type { AppNotification, NotificationAudience, NotificationKind, NotificationPage } from "@/modules/notifications/notifications.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type View = "all" | "unread";

const KIND_OPTIONS = (Object.keys(NOTIFICATION_KIND_LABEL) as NotificationKind[]).map((value) => ({ value, label: NOTIFICATION_KIND_LABEL[value] }));

// Danh sách thông báo theo trang (xem thêm), lọc loại và chưa đọc ở server; số chưa đọc đếm trên toàn bộ thông báo của cổng.
export function NotificationList({ audience, initialPage, unreadCount }: { audience: NotificationAudience; initialPage: NotificationPage; unreadCount: number }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<AppNotification[]>(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [unread, setUnread] = useState(unreadCount);
  const [view, setView] = useState<View>("all");
  const [kind, setKind] = useState<NotificationKind>();
  const [busy, setBusy] = useState<"more" | "filter" | "all" | null>(null);

  const load = (next: { view: View; kind?: NotificationKind; cursor?: string }, mode: "replace" | "append") => {
    setBusy(mode === "append" ? "more" : "filter");
    startTransition(async () => {
      const result = await loadNotifications({ audience, kind: next.kind, unreadOnly: next.view === "unread", cursor: next.cursor }).catch(() => null);
      setBusy(null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? "Chưa tải được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      setItems((current) => (mode === "append" ? [...current, ...result.data.items.filter((item) => !current.some((entry) => entry.id === item.id))] : result.data.items));
      setCursor(result.data.nextCursor);
    });
  };

  const markRead = (item: AppNotification) => {
    if (item.isRead) return;
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)));
    setUnread((count) => Math.max(0, count - 1));
    void markNotificationsRead({ ids: [item.id] }).catch(() => undefined);
  };

  const markAll = () => {
    setBusy("all");
    startTransition(async () => {
      const result = await markAllNotificationsRead(audience).catch(() => null);
      setBusy(null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? "Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      setUnread(0);
      setItems((current) => (view === "unread" ? [] : current.map((entry) => ({ ...entry, isRead: true }))));
      if (view === "unread") setCursor(null);
    });
  };

  const remove = (item: AppNotification) =>
    startTransition(async () => {
      const result = await deleteNotifications({ ids: [item.id] }).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? "Chưa xóa được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (!item.isRead) setUnread((count) => Math.max(0, count - 1));
    });

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={(value) => {
            setView(value);
            load({ view: value, kind }, "replace");
          }}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "unread", label: `Chưa đọc (${unread})` },
          ]}
        />
        <Select
          allowClear
          value={kind}
          onChange={(value?: NotificationKind) => {
            setKind(value);
            load({ view, kind: value }, "replace");
          }}
          loading={busy === "filter"}
          placeholder="Mọi loại"
          aria-label="Loại thông báo"
          options={KIND_OPTIONS}
          className="w-40"
        />
        {unread > 0 && (
          <Button className="ml-auto" loading={busy === "all"} onClick={markAll}>
            Đánh dấu đã đọc hết
          </Button>
        )}
      </div>
      <SectionCard flush>
        {items.length === 0 ? (
          <EmptyState
            title={view === "unread" ? "Đã đọc hết thông báo" : "Chưa có thông báo"}
            description={view === "unread" ? "Thông báo mới về hạn chót, đơn từ và điểm sẽ hiện ở đây." : undefined}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong">
            {items.map((item) => (
              <li key={item.id} className="flex items-start">
                <Link href={item.href} onClick={() => markRead(item)} className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-foreground transition-colors hover:bg-surface-hover sm:px-5">
                  <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-primary"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={`text-pretty ${item.isRead ? "" : "font-medium"}`}>{item.title}</span>
                    <span className="text-sm text-pretty text-muted">{item.body}</span>
                    <span className="text-xs text-muted">
                      {NOTIFICATION_KIND_LABEL[item.kind]} · <span title={formatDateTime(item.createdAt)} suppressHydrationWarning>{formatRelative(item.createdAt)}</span>
                      {!item.isRead && <span className="sr-only">, chưa đọc</span>}
                    </span>
                  </span>
                </Link>
                <Button
                  type="text"
                  size="small"
                  className="m-2 shrink-0"
                  disabled={isPending}
                  aria-label={`Xóa thông báo ${item.title}`}
                  icon={<Trash size={16} aria-hidden className="text-zinc-500" />}
                  onClick={() => remove(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      {cursor && (
        <Button className="self-center" loading={busy === "more"} onClick={() => load({ view, kind, cursor }, "append")}>
          Xem thêm
        </Button>
      )}
    </div>
  );
}
