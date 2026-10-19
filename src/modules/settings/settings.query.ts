import "server-only";
import { cache } from "react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { requirePermission } from "@/modules/access/access.query";
import { requireSession } from "@/modules/authentication/authentication.query";
import { user } from "@/modules/authentication/authentication.schema";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { REPORT_DEFINITIONS } from "@/modules/settings/settings.constant";
import { calendarEvents, regulations, reportExports, type RegulationRules } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportExportJob, ReportExportStatus } from "@/modules/settings/settings.type";

const REGULATION_COLUMNS = {
  version: regulations.version,
  effectiveFrom: regulations.effectiveFrom,
  rules: regulations.rules,
  createdAt: regulations.createdAt,
  createdBy: user.name,
};

type RegulationRow = { version: string; effectiveFrom: string; rules: RegulationRules; createdAt: Date; createdBy: string | null };

function toRegulation({ version, effectiveFrom, rules, createdAt, createdBy }: RegulationRow): RegulationSettings {
  return { version, effectiveFrom, updatedAt: createdAt.toISOString(), updatedBy: createdBy ?? "Hệ thống", ...rules };
}

// Bản quy chế đang áp dụng hôm nay: ngày áp dụng gần nhất không sau hôm nay. Chưa có bản nào tới ngày thì lấy bản sớm nhất.
// Nhiều trang và quy tắc (đăng ký, điểm danh, lịch thi) gọi trong cùng request nên cache theo request.
export const getRegulation = cache(async (): Promise<RegulationSettings> => {
  await requireSession();
  const [row] = await db
    .select(REGULATION_COLUMNS)
    .from(regulations)
    .leftJoin(user, eq(user.id, regulations.createdByUserId))
    .orderBy(sql`${regulations.effectiveFrom} <= current_date DESC`, sql`CASE WHEN ${regulations.effectiveFrom} <= current_date THEN ${regulations.effectiveFrom} END DESC`, asc(regulations.effectiveFrom))
    .limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
});

// Trang sửa quy chế mở bản mới nhất, kể cả bản đã lưu nhưng chưa tới ngày áp dụng.
export async function getLatestRegulation(): Promise<RegulationSettings> {
  await requirePermission("settings.manage");
  const [row] = await db.select(REGULATION_COLUMNS).from(regulations).leftJoin(user, eq(user.id, regulations.createdByUserId)).orderBy(desc(regulations.effectiveFrom)).limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
}

// Công khai (trang Giới thiệu): lịch sử các bản quy chế.
export async function getRegulationVersions(): Promise<RegulationVersion[]> {
  return db
    .select({ version: regulations.version, effectiveFrom: regulations.effectiveFrom, decision: regulations.decision, summary: regulations.summary })
    .from(regulations)
    .orderBy(desc(regulations.effectiveFrom));
}

export const CALENDAR_EVENT_COLUMNS = {
  id: calendarEvents.id,
  termId: calendarEvents.termId,
  kind: calendarEvents.kind,
  title: calendarEvents.title,
  startDate: calendarEvents.startDate,
  endDate: calendarEvents.endDate,
  audience: calendarEvents.audience,
};

// Công khai: lịch năm học hiện trên trang chủ.
export async function getCalendarEvents(termId?: string): Promise<CalendarEvent[]> {
  return db
    .select(CALENDAR_EVENT_COLUMNS)
    .from(calendarEvents)
    .where(termId ? eq(calendarEvents.termId, termId) : undefined)
    .orderBy(asc(calendarEvents.startDate), asc(calendarEvents.id));
}

const JOB_STATUS: Record<"queued" | "running" | "done" | "failed", ReportExportStatus> = { queued: "running", running: "running", done: "ready", failed: "failed" };

export type ReportParams = { termId: string; faculty: string; format: string };

export async function getReportExports(id?: string): Promise<ReportExportJob[]> {
  const viewer = await requirePermission("reports.view");
  const [rows, termRows] = await Promise.all([
    db
      .select({
        id: reportExports.id,
        reportKey: reportExports.reportKey,
        params: reportExports.params,
        status: reportExports.status,
        rowCount: reportExports.rowCount,
        createdAt: reportExports.createdAt,
        createdBy: user.name,
      })
      .from(reportExports)
      .leftJoin(user, eq(user.id, reportExports.requestedByUserId))
      .where(id ? eq(reportExports.id, id) : viewer.faculty ? sql`${reportExports.params}->>'faculty' = ${viewer.faculty}` : undefined)
      .orderBy(desc(reportExports.createdAt))
      .limit(100),
    db.select({ id: terms.id, shortName: terms.shortName }).from(terms),
  ]);
  const termName = new Map(termRows.map((term) => [term.id, term.shortName]));
  return rows.map((row) => {
    const params = row.params as Partial<ReportParams>;
    const scope = !params.faculty || params.faculty === "all" ? "toàn trường" : params.faculty;
    return {
      id: row.id,
      reportId: row.reportKey,
      reportName: REPORT_DEFINITIONS.find((report) => report.id === row.reportKey)?.name ?? row.reportKey,
      params: [params.termId ? termName.get(params.termId) : null, scope].filter(Boolean).join(", "),
      format: (params.format ?? "").toUpperCase(),
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy ?? "Hệ thống",
      status: JOB_STATUS[row.status],
      rows: row.rowCount,
    };
  });
}
