import Link from "next/link";
import { Pin } from "defeat-icons-react";
import { daysUntil, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/modules/announcements/announcements.constant";
import type { Announcement } from "@/modules/announcements/announcements.type";

export function deadlineHint(deadline: string | null, withTime = false) {
  if (!deadline) return null;
  const days = daysUntil(deadline);
  const when = withTime ? formatDateTime(deadline) : formatDate(deadline);
  if (days < 0) return { text: `Đã hết hạn ${when}`, className: "text-muted", type: "info" as const };
  if (days === 0) return { text: withTime ? `Hết hạn hôm nay, ${when}` : "Hết hạn hôm nay", className: "text-rose-700", type: "error" as const };
  if (days <= 3) return { text: `Còn ${days} ngày, hạn ${when}`, className: "text-amber-700", type: "warning" as const };
  return { text: `Hạn ${when}`, className: "text-muted", type: "info" as const };
}

export function PublicAnnouncementItem({ announcement }: { announcement: Announcement }) {
  const hint = deadlineHint(announcement.deadline);
  return (
    <Link
      href={`/announcements/${announcement.slug}`}
      className="flex flex-col gap-2 px-4 py-4 text-foreground transition-colors hover:bg-surface-hover sm:flex-row sm:gap-5 sm:px-5"
    >
      <span className="flex shrink-0 flex-row gap-2 text-xs text-muted sm:w-24 sm:flex-col sm:gap-1">
        <span className="font-medium text-foreground tabular-nums">{announcement.publishedAt ? formatDate(announcement.publishedAt) : ""}</span>
        {ANNOUNCEMENT_CATEGORY_LABEL[announcement.category]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-medium text-pretty">
          {announcement.isPinned && <Pin size={16} aria-label="Ghim" className="mr-1.5 inline-block align-[-2px] text-primary" />}
          {announcement.title}
        </span>
        <span className="line-clamp-2 text-sm text-pretty text-muted">{announcement.summary}</span>
        <span className="text-xs text-muted">
          {announcement.audiences.join(", ")}
          {hint && (
            <>
              {" · "}
              <span className={`tabular-nums ${hint.className}`}>{hint.text}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
