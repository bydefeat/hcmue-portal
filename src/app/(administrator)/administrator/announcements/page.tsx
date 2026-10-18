import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AnnouncementTable } from "@/modules/announcements/components/announcement-table";
import { getAnnouncements } from "@/modules/announcements/announcements.query";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Thông báo" };

export default async function Page() {
  await requirePermission("announcements.manage");
  const announcements = await getAnnouncements();
  return (
    <>
      <PageHeader
        title="Thông báo"
        description="Thông báo đã đăng hiện trên trang chủ và gửi email tới đúng đối tượng. Thông báo hẹn giờ tự đăng khi tới giờ."
      />
      <AnnouncementTable announcements={announcements} />
    </>
  );
}
