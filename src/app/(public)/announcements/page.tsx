import type { Metadata } from "next";
import { PublicAnnouncementBrowser } from "@/modules/announcements/components/public-announcement-browser";
import { getPublishedAnnouncements } from "@/modules/announcements/announcements.query";

export const metadata: Metadata = { title: "Thông báo đào tạo" };

export default async function Page() {
  const announcements = await getPublishedAnnouncements();
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Thông báo đào tạo</h1>
        <p className="max-w-prose text-sm text-pretty text-muted">
          Thông báo chính thức của Phòng Đào tạo và các đơn vị về đăng ký học phần, lịch thi, học phí và học vụ.
        </p>
      </div>
      <PublicAnnouncementBrowser announcements={announcements} />
    </div>
  );
}
