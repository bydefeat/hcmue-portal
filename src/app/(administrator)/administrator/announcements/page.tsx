import type { Metadata } from "next";
import { AnnouncementTable } from "@/modules/announcements/components/announcement-table";
import { getAnnouncementAudienceOptions, getAnnouncements } from "@/modules/announcements/announcements.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  await requirePermission("announcements.manage");
  const [announcements, audienceOptions] = await Promise.all([getAnnouncements(), getAnnouncementAudienceOptions()]);
  return (
    <AnnouncementTable
      header={{
        title: "Thông báo",
        description:
          "Thông báo đã đăng hiện ở cổng sinh viên, giảng viên theo đối tượng; thông báo có gửi sinh viên hiện cả trên trang chủ. Hẹn giờ tự đăng khi tới giờ, quá hạn chót tự rời danh sách.",
      }}
      announcements={announcements}
      audienceOptions={audienceOptions}
    />
  );
}
