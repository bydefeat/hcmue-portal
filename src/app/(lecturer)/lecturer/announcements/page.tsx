import type { Metadata } from "next";
import { PublicAnnouncementBrowser } from "@/modules/announcements/components/public-announcement-browser";
import { getPortalAnnouncements } from "@/modules/announcements/announcements.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  const announcements = await getPortalAnnouncements("lecturer");
  return (
    <>
      <PageHeader title="Thông báo" description="Thông báo của Phòng Đào tạo và các đơn vị gửi tới giảng viên khoa của bạn. Thông báo quá hạn chót tự rời danh sách." />
      <PublicAnnouncementBrowser announcements={announcements} basePath="/lecturer/announcements" />
    </>
  );
}
