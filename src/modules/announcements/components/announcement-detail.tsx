import { Alert } from "antd";
import { PageHeader } from "@/shared/components/ui/page-header";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDateTime } from "@/shared/libs/date.lib";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/modules/announcements/announcements.constant";
import type { Announcement } from "@/modules/announcements/announcements.type";
import { deadlineHint, PublicAnnouncementItem } from "@/modules/announcements/components/public-announcement-item";

// Trang chi tiết thông báo chung, dùng cho trang công khai và trang thông báo trong cổng sinh viên, giảng viên.
export function AnnouncementDetail({
  announcement,
  related,
  back,
  basePath,
}: {
  announcement: Announcement;
  related: Announcement[];
  back: { href: string; label: string };
  basePath?: string;
}) {
  const hint = deadlineHint(announcement.deadline, true);
  return (
    <>
      <PageHeader
        title={announcement.title}
        back={back}
        description={
          <span className="text-xs">
            {[
              ANNOUNCEMENT_CATEGORY_LABEL[announcement.category],
              announcement.author,
              announcement.publishedAt ? `Đăng lúc ${formatDateTime(announcement.publishedAt)}` : null,
              `Gửi tới: ${announcement.audienceLabel}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <SectionCard>
          <article className="flex min-w-0 flex-col gap-4">
            {hint && <Alert type={hint.type} showIcon title={<span className="tabular-nums">{hint.text}</span>} />}
            <p className="max-w-prose text-base text-pretty">{announcement.summary}</p>
            <p className="max-w-prose text-sm text-pretty whitespace-pre-line">{announcement.content}</p>
          </article>
        </SectionCard>
        <SectionCard title="Cùng nhóm" flush>
          {related.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted sm:px-5">Chưa có thông báo khác cùng nhóm.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-strong">
              {related.map((entry) => (
                <li key={entry.id}>
                  <PublicAnnouncementItem announcement={entry} basePath={basePath} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
