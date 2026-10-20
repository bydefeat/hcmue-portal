import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { AnnouncementDetail } from "@/modules/announcements/components/announcement-detail";
import { recordAnnouncementView } from "@/modules/announcements/announcements.lib";
import { getPublishedAnnouncement, getPublishedAnnouncements } from "@/modules/announcements/announcements.query";

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
  // Lượt xem tăng sau khi trả trang, không làm chậm trang.
  after(() => recordAnnouncementView(announcement.id).catch((error: unknown) => console.error("[announcements] Không ghi được lượt xem:", error)));
  return <AnnouncementDetail announcement={announcement} related={related} back={{ href: "/announcements", label: "Thông báo đào tạo" }} />;
}
