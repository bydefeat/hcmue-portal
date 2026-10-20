import type { Transaction } from "@/shared/libs/db.lib";
import { ANNOUNCEMENTS } from "@/modules/announcements/announcements.mock";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { SeedContext } from "./context";

// Thông báo chung; thông báo của Phòng Đào tạo gắn với tài khoản cán bộ seed, của đơn vị khác chỉ ghi tên đơn vị. Bài đã đăng
// coi như đã gửi (notified_at) để tác vụ announcement-notifications không gửi lại; bài hẹn giờ chờ tới giờ.
export async function seedAnnouncements(tx: Transaction, context: SeedContext) {
  await tx.insert(announcements).values(
    ANNOUNCEMENTS.map(({ author, views, publishedAt, deadline, ...announcement }) => ({
      ...announcement,
      authorLabel: author,
      authorUserId: author === "Phòng Đào tạo" ? context.adminUserId : null,
      viewCount: views,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      deadline: deadline ? new Date(deadline) : null,
      notifiedAt: announcement.status === "published" || announcement.status === "archived" ? new Date(publishedAt!) : null,
    })),
  );
  return { announcements: ANNOUNCEMENTS.length };
}
