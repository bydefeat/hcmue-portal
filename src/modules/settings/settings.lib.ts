import "server-only";
import { asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { schoolToday } from "@/shared/libs/date.lib";
import { toCsv } from "@/shared/libs/download.lib";
import { buildTablePdf, PDF_MIME } from "@/shared/libs/pdf.lib";
import { buildSpreadsheet, XLSX_MIME } from "@/shared/libs/spreadsheet.lib";
import { deleteFiles, sweepOrphanFiles } from "@/shared/libs/storage.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { REPORT_EXPORT_RETENTION_DAYS } from "@/modules/settings/settings.constant";
import { reportCellText } from "@/modules/settings/settings.rule";
import { regulations, reportExports, type RegulationRules } from "@/modules/settings/settings.schema";
import type { RegulationSettings, ReportCell, ReportFormat } from "@/modules/settings/settings.type";

type Executor = Transaction | typeof db;

export const REGULATION_COLUMNS = {
  version: regulations.version,
  effectiveFrom: regulations.effectiveFrom,
  rules: regulations.rules,
  createdAt: regulations.createdAt,
  createdBy: user.name,
};

type RegulationRow = { version: string; effectiveFrom: string; rules: RegulationRules; createdAt: Date; createdBy: string | null };

export function toRegulation({ version, effectiveFrom, rules, createdAt, createdBy }: RegulationRow): RegulationSettings {
  return { version, effectiveFrom, updatedAt: createdAt.toISOString(), updatedBy: createdBy ?? "Hệ thống", ...rules };
}

export async function regulationAt(executor: Executor, date: string = schoolToday()): Promise<RegulationSettings> {
  const [row] = await executor
    .select(REGULATION_COLUMNS)
    .from(regulations)
    .leftJoin(user, eq(user.id, regulations.createdByUserId))
    .orderBy(
      sql`${regulations.effectiveFrom} <= ${date}::date DESC`,
      sql`CASE WHEN ${regulations.effectiveFrom} <= ${date}::date THEN ${regulations.effectiveFrom} END DESC`,
      asc(regulations.effectiveFrom),
    )
    .limit(1);
  if (!row) throw new Error("Chưa có quy chế đào tạo trong hệ thống");
  return toRegulation(row);
}

export type ReportFile = { data: Uint8Array; contentType: string };

export async function buildReportFile(
  table: { header: string[]; rows: ReportCell[][] },
  meta: { title: string; subtitle: string },
  format: ReportFormat,
): Promise<ReportFile> {
  if (format === "pdf") {
    const data = await buildTablePdf({ title: meta.title, subtitle: meta.subtitle, unit: "Phòng Đào tạo", header: table.header, rows: table.rows.map((row) => row.map(reportCellText)) });
    return { data, contentType: PDF_MIME };
  }
  if (format === "xlsx") {
    const data = await buildSpreadsheet(
      meta.title,
      table.header.map((header) => ({ header, text: /^(MSSV|Mã)/.test(header) })),
      table.rows,
    );
    return { data, contentType: XLSX_MIME };
  }
  const text = `﻿${toCsv([table.header, ...table.rows.map((row) => row.map(reportCellText))])}`;
  return { data: new TextEncoder().encode(text), contentType: "text/csv;charset=utf-8" };
}

export async function purgeReportExports(executor: Executor = db, now = new Date()) {
  const cutoff = new Date(now.getTime() - REPORT_EXPORT_RETENTION_DAYS * 24 * 3_600_000);
  const removed = await executor.delete(reportExports).where(lt(reportExports.createdAt, cutoff)).returning({ storageKey: reportExports.storageKey });
  await deleteFiles(removed.flatMap((row) => (row.storageKey ? [row.storageKey] : [])));
  const orphans = await sweepOrphanFiles("reports", async (keys) => {
    const rows = await db.select({ key: reportExports.storageKey }).from(reportExports).where(inArray(reportExports.storageKey, keys));
    return new Set(rows.flatMap((row) => (row.key ? [row.key] : [])));
  });
  return { reportExportsRemoved: removed.length, reportFilesRemoved: orphans };
}
