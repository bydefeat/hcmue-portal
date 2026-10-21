"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "antd";
import { Pin } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDateTime, formatRelative } from "@/shared/libs/date.lib";
import { markClassAnnouncementRead } from "@/modules/teaching/teaching.action";
import type { StudentClassAnnouncement } from "@/modules/teaching/teaching.type";

const PREVIEW_LENGTH = 280;

export function StudentClassAnnouncements({ announcements }: { announcements: StudentClassAnnouncement[] }) {
  const [unreadAtOpen] = useState(() => new Set(announcements.filter((announcement) => !announcement.isRead).map((announcement) => announcement.id)));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const marked = useRef(new Set<string>());

  const markRead = (id: string) => {
    if (marked.current.has(id)) return;
    marked.current.add(id);
    void markClassAnnouncementRead(id)
      .then((result) => {
        if (!result.ok) marked.current.delete(id);
      })
      .catch(() => marked.current.delete(id));
  };

  useEffect(() => {
    const pending = announcements.filter((announcement) => !announcement.isRead).map((announcement) => announcement.id);
    const done = marked.current;
    void (async () => {
      for (const id of pending) {
        if (done.has(id)) continue;
        done.add(id);
        const result = await markClassAnnouncementRead(id).catch(() => null);
        if (!result?.ok) done.delete(id);
      }
    })();
  }, [announcements, marked]);

  const toggle = (id: string) => {
    markRead(id);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SectionCard title="Thông báo của lớp" extra={unreadAtOpen.size > 0 ? <span className="text-sm text-muted tabular-nums">{unreadAtOpen.size} mới</span> : undefined} flush={announcements.length === 0}>
      {announcements.length === 0 ? (
        <EmptyState title="Giảng viên chưa đăng thông báo cho lớp" description="Lịch nghỉ, bài tập, tài liệu của lớp sẽ hiện ở đây và trong chuông thông báo." />
      ) : (
        <ul className="flex flex-col gap-3">
          {announcements.map((announcement) => {
            const isLong = announcement.body.length > PREVIEW_LENGTH;
            const isOpen = expanded.has(announcement.id);
            return (
              <li key={announcement.id}>
                <Card size="small">
                  <div className="flex flex-col gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-pretty">
                        {announcement.isPinned && <Pin size={16} aria-label="Đã ghim" className="shrink-0 text-primary" />}
                        {announcement.title}
                      </h3>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {unreadAtOpen.has(announcement.id) && <Badge status="processing" text={<span className="text-xs">Mới</span>} />}
                        <span>{announcement.author}</span>
                        <span className="tabular-nums" title={formatDateTime(announcement.publishAt)} suppressHydrationWarning>
                          {formatRelative(announcement.publishAt)}
                        </span>
                      </span>
                    </div>
                    <p className="max-w-prose text-sm text-pretty whitespace-pre-line">
                      {isLong && !isOpen ? `${announcement.body.slice(0, PREVIEW_LENGTH).trimEnd()}…` : announcement.body}
                    </p>
                    {isLong && (
                      <Button type="link" size="small" className="self-start px-0" onClick={() => toggle(announcement.id)}>
                        {isOpen ? "Thu gọn" : "Đọc tiếp"}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
