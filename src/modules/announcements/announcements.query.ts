import { dayjs } from "@/shared/libs/date.lib";
import { mockDelay } from "@/shared/libs/mock-request.lib";
import { ANNOUNCEMENTS } from "@/modules/announcements/announcements.mock";

function byNewest(a: { publishedAt: string | null }, b: { publishedAt: string | null }) {
  return dayjs(b.publishedAt ?? "2100-01-01").valueOf() - dayjs(a.publishedAt ?? "2100-01-01").valueOf();
}

export async function getAnnouncements() {
  await mockDelay();
  return [...ANNOUNCEMENTS].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || byNewest(a, b));
}

export async function getPublishedAnnouncements(limit?: number) {
  await mockDelay();
  const published = ANNOUNCEMENTS.filter((announcement) => announcement.status === "published").sort(
    (a, b) => Number(b.isPinned) - Number(a.isPinned) || byNewest(a, b),
  );
  return limit ? published.slice(0, limit) : published;
}

export async function getPublishedAnnouncement(slug: string) {
  await mockDelay();
  return ANNOUNCEMENTS.find((announcement) => announcement.slug === slug && announcement.status === "published") ?? null;
}
