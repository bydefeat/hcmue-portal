import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "defeat-icons-react";
import { deadlineHint, PublicAnnouncementItem } from "@/modules/announcements/components/public-announcement-item";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/modules/announcements/announcements.constant";
import { getPublishedAnnouncement, getPublishedAnnouncements } from "@/modules/announcements/announcements.query";
import { formatDateTime } from "@/shared/libs/date.lib";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const announcement = await getPublishedAnnouncement(slug);
  return { title: announcement?.title ?? "Không tìm thấy thông báo" };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const announcement = await getPublishedAnnouncement(slug);
  if (!announcement) notFound();
  const related = (await getPublishedAnnouncements()).filter((entry) => entry.id !== announcement.id && entry.category === announcement.category).slice(0, 3);
  const hint = deadlineHint(announcement.deadline);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-strong bg-surface p-4 sm:p-6">
        <Link href="/announcements" className="flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
          <ChevronLeft size={14} aria-hidden />
          Thông báo đào tạo
        </Link>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted">{ANNOUNCEMENT_CATEGORY_LABEL[announcement.category]}</span>
          <h1 className="text-xl font-semibold text-pretty">{announcement.title}</h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>{announcement.author}</span>
            {announcement.publishedAt && <span className="tabular-nums">Đăng lúc {formatDateTime(announcement.publishedAt)}</span>}
            <span>Gửi tới: {announcement.audiences.join(", ")}</span>
          </p>
        </div>
        {hint && (
          <p className={`rounded-lg border border-border-strong px-3 py-2 text-sm tabular-nums ${hint.className}`}>
            {hint.text}
            {announcement.deadline && `, lúc ${formatDateTime(announcement.deadline)}`}
          </p>
        )}
        <p className="max-w-prose text-base text-pretty">{announcement.summary}</p>
        <p className="max-w-prose text-sm leading-7 text-pretty">{announcement.content}</p>
      </article>
      <aside className="flex min-w-0 flex-col gap-3">
        <h2 className="text-lg font-semibold">Cùng nhóm</h2>
        {related.length === 0 ? (
          <p className="text-sm text-muted">Chưa có thông báo khác cùng nhóm.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-strong rounded-xl border border-border-strong bg-surface">
            {related.map((entry) => (
              <li key={entry.id}>
                <PublicAnnouncementItem announcement={entry} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
