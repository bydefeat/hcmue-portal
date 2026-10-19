"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Popover } from "antd";
import { Bell } from "defeat-icons-react";
import { formatRelative } from "@/shared/libs/date.lib";
import { EmptyState } from "./empty-state";

export type BellItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  isRead: boolean;
  kindLabel: string;
};

type NotificationBellProps = {
  items: BellItem[];
  viewAllHref: string;
};

const VISIBLE = 6;

export function NotificationBell({ items, viewAllHref }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const isRead = (item: BellItem) => item.isRead || readIds.includes(item.id);
  const unread = items.filter((item) => !isRead(item)).length;

  const content = (
    <div className="flex w-[min(360px,calc(100vw-64px))] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border-strong px-1 pb-2">
        <span className="font-semibold">Thông báo</span>
        {unread > 0 && (
          <Button type="link" size="small" className="px-0" onClick={() => setReadIds(items.map((item) => item.id))}>
            Đánh dấu đã đọc hết
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="Chưa có thông báo" />
      ) : (
        <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto py-2">
          {items.slice(0, VISIBLE).map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => {
                  setReadIds((current) => [...current, item.id]);
                  setOpen(false);
                }}
                className="flex gap-3 rounded-lg px-2 py-2 text-foreground transition-colors hover:bg-item-hover"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead(item) ? "bg-transparent" : "bg-primary"}`}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`text-sm text-pretty ${isRead(item) ? "" : "font-medium"}`}>{item.title}</span>
                  <span className="line-clamp-2 text-xs text-pretty text-muted">{item.body}</span>
                  <span className="text-xs text-muted">
                    {item.kindLabel} · {formatRelative(item.createdAt)}
                    {!isRead(item) && <span className="sr-only">, chưa đọc</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={viewAllHref}
        onClick={() => setOpen(false)}
        className="border-t border-border-strong px-1 pt-2 text-center text-sm"
      >
        Xem tất cả thông báo
      </Link>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} arrow={false}>
      <Button
        type="text"
        shape="circle"
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        icon={
          <Badge count={unread} size="small" offset={[2, -2]}>
            <Bell size={20} aria-hidden className="text-zinc-500" />
          </Badge>
        }
      />
    </Popover>
  );
}
