import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { CALENDAR_EVENTS, REGULATION, REGULATION_VERSIONS, REPORT_EXPORTS } from "@/modules/settings/settings.mock";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";
import type { SeedContext } from "./context";

// Cấu hình đào tạo: các bản quy chế (bản mới nhất đang áp dụng), lịch năm học và lịch sử xuất báo cáo.
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
  await tx.insert(reportExports).values(
    REPORT_EXPORTS.map((job) => ({
      id: job.id,
      reportKey: job.reportKey,
      params: { termId: job.termId, faculty: job.faculty, format: job.format },
      status: "done" as const,
      requestedByUserId: context.adminUserId,
      rowCount: job.rowCount,
      storageKey: `reports/${job.id}.${job.format}`,
      createdAt: new Date(job.createdAt),
      finishedAt: dayjs(job.createdAt).add(1, "minute").toDate(),
    })),
  );
  return { regulations: REGULATION_VERSIONS.length, calendarEvents: CALENDAR_EVENTS.length };
}
