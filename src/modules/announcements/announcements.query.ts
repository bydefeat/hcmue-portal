import { dayjs } from "@/shared/libs/date.lib";
import { mockDelay } from "@/shared/libs/mock.lib";
import { ANNOUNCEMENTS } from "./announcements.mock";

function byNewest(a: { publishedAt: string | null }, b: { publishedAt: string | null }) {
  return dayjs(b.publishedAt ?? "2100-01-01").valueOf() - dayjs(a.publishedAt ?? "2100-01-01").valueOf();
}

export async function getAnnouncements() {
  await mockDelay();
  return [...ANNOUNCEMENTS].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || byNewest(a, b));
}

export async function getPublishedAnnouncements(limit?: number) {
  const published = ANNOUNCEMENTS.filter((announcement) => announcement.status === "published").sort(byNewest);
  return limit ? published.slice(0, limit) : published;
}
