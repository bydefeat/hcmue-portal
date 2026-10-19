import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "antd";
import { deadlineHint, PublicAnnouncementItem } from "@/modules/announcements/components/public-announcement-item";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/modules/announcements/announcements.constant";
import { getPublishedAnnouncement, getPublishedAnnouncements } from "@/modules/announcements/announcements.query";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
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
  const hint = deadlineHint(announcement.deadline, true);

  return (
    <>
      <PageHeader
        title={announcement.title}
        back={{ href: "/announcements", label: "Thông báo đào tạo" }}
        description={
          <span className="text-xs">
            {[
              ANNOUNCEMENT_CATEGORY_LABEL[announcement.category],
              announcement.author,
              announcement.publishedAt ? `Đăng lúc ${formatDateTime(announcement.publishedAt)}` : null,
              `Gửi tới: ${announcement.audiences.join(", ")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <SectionCard>
          <article className="flex min-w-0 flex-col gap-4">
            {hint && (
              <Alert
                type={hint.type}
                showIcon
                title={<span className="tabular-nums">{hint.text}</span>}
              />
            )}
            <p className="max-w-prose text-base text-pretty">{announcement.summary}</p>
            <p className="max-w-prose text-sm text-pretty">{announcement.content}</p>
          </article>
        </SectionCard>
        <SectionCard title="Cùng nhóm" flush>
          {related.length === 0 ? (
            <p className="px-4 sm:px-5 py-3 text-sm text-muted">Chưa có thông báo khác cùng nhóm.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {related.map((entry) => (
                <li key={entry.id}>
                  <PublicAnnouncementItem announcement={entry} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
