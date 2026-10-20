import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { deleteFiles, listFiles } from "@/shared/libs/storage.lib";
import { CALENDAR_EVENTS, REGULATION, REGULATION_VERSIONS } from "@/modules/settings/settings.mock";
import { calendarEvents, regulations } from "@/modules/settings/settings.schema";
import type { SeedContext } from "./context";

// Cấu hình đào tạo: các bản quy chế (bản mới nhất đang áp dụng) và mốc lịch năm học. Lịch sử xuất báo cáo để trống: mỗi lần
// xuất lưu tệp thật trong kho, seed chỉ dọn tệp báo cáo của lần chạy trước.
export async function seedSettings(tx: Transaction, context: SeedContext) {
  await tx.insert(regulations).values(
    REGULATION_VERSIONS.map((version) => ({
      id: version.id,
      version: version.version,
      effectiveFrom: version.effectiveFrom,
      decision: version.decision,
      summary: version.summary,
      rules: version.rules,
      createdAt: version.version === REGULATION.version ? new Date(REGULATION.updatedAt) : dayjs(version.effectiveFrom).subtract(30, "day").hour(9).toDate(),
      createdByUserId: version.version === REGULATION.version ? context.adminUserId : null,
    })),
  );
  await tx.insert(calendarEvents).values(CALENDAR_EVENTS);
  await deleteFiles((await listFiles("reports")).map((entry) => entry.key));
  return { regulations: REGULATION_VERSIONS.length, calendarEvents: CALENDAR_EVENTS.length };
}
