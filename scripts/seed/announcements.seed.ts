import type { Transaction } from "@/shared/libs/db.lib";
import { ANNOUNCEMENTS } from "@/modules/announcements/announcements.mock";
import { announcements } from "@/modules/announcements/announcements.schema";
import type { SeedContext } from "./context";

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
