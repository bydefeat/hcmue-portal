import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { AnnouncementDetail } from "@/modules/announcements/components/announcement-detail";
import { recordAnnouncementView } from "@/modules/announcements/announcements.lib";
import { getPortalAnnouncement, getPortalAnnouncements } from "@/modules/announcements/announcements.query";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const announcement = await getPortalAnnouncement("student", slug);
  return { title: announcement?.title ?? "Không tìm thấy thông báo" };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const announcement = await getPortalAnnouncement("student", slug);
  if (!announcement) notFound();
  const related = (await getPortalAnnouncements("student")).filter((entry) => entry.id !== announcement.id && entry.category === announcement.category).slice(0, 3);
  after(() => recordAnnouncementView(announcement.id).catch((error: unknown) => console.error("[announcements] Không ghi được lượt xem:", error)));
  return (
    <AnnouncementDetail
      announcement={announcement}
      related={related}
      back={{ href: "/application/announcements", label: "Thông báo chung" }}
      basePath="/application/announcements"
    />
  );
}
