import type { Metadata } from "next";
import { PublicAnnouncementBrowser } from "@/modules/announcements/components/public-announcement-browser";
import { getPublishedAnnouncements } from "@/modules/announcements/announcements.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thông báo đào tạo" };

export default async function Page() {
  const announcements = await getPublishedAnnouncements();
  return (
    <>
      <PageHeader
        title="Thông báo đào tạo"
        description="Thông báo chính thức của Phòng Đào tạo và các đơn vị về đăng ký học phần, lịch thi, học phí và học vụ."
      />
      <PublicAnnouncementBrowser announcements={announcements} />
    </>
  );
}
