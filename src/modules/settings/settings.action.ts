"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate, schoolTime, schoolToday } from "@/shared/libs/date.lib";
import { bytesToBase64 } from "@/shared/libs/spreadsheet.lib";
import { isUuid, newId } from "@/shared/libs/id.lib";
import { newStorageKey, readFile, withStoredFiles } from "@/shared/libs/storage.lib";
import { can, PERMISSION_LABEL } from "@/modules/access/access.constant";
import { requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { CALENDAR_EVENT_LABEL, REPORT_DEFINITIONS, SETTINGS_CONSTRAINT_MESSAGE } from "@/modules/settings/settings.constant";
import { CALENDAR_EVENT_COLUMNS, getLatestRegulation, getRegulationVersions, getReportExports, getReportTable, type ReportParams } from "@/modules/settings/settings.query";
import { buildReportFile } from "@/modules/settings/settings.lib";
import {
  CALENDAR_EVENT_SCHEMA,
  calendarEventTermReason,
  nextRegulationVersion,
  REGULATION_SAVE_SCHEMA,
  regulationChanges,
  REPORT_EXPORT_SCHEMA,
  reportFileName,
  type CalendarEventInput,
  type RegulationSaveInput,
  type ReportExportInput,
} from "@/modules/settings/settings.rule";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportExportJob } from "@/modules/settings/settings.type";

export async function saveRegulation(input: RegulationSaveInput): Promise<ActionResult<{ regulation: RegulationSettings; versions: RegulationVersion[] }>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  const parsed = parseInput(REGULATION_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { rules, decision, reason, effectiveFrom } = parsed.data;
  if (effectiveFrom < schoolToday()) return actionError("Ngày áp dụng không được trước hôm nay.", { effectiveFrom: "Không được trước hôm nay" });
  let outcome: "unchanged" | "saved";
  try {
    outcome = await db.transaction(async (tx) => {
      const existing = await tx.select({ version: regulations.version, rules: regulations.rules }).from(regulations).orderBy(desc(regulations.effectiveFrom)).for("update");
      const changes = existing[0] ? regulationChanges(existing[0].rules, rules) : [];
      if (existing[0] && changes.length === 0) return "unchanged";
      const version = nextRegulationVersion(
        existing.map((row) => row.version),
        effectiveFrom,
      );
      const [created] = await tx
        .insert(regulations)
        .values({ version, effectiveFrom, decision, summary: reason, rules, createdByUserId: viewer.id })
        .returning({ id: regulations.id });
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "update",
        entityType: "regulation",
        entityId: created.id,
        entityLabel: `Quy chế đào tạo ${version}`,
        summary: `${reason} (áp dụng từ ${formatDate(effectiveFrom)}, quyết định ${decision})`,
        changes,
      });
      return "saved";
    });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  if (outcome === "unchanged") return actionError("Các tham số chưa khác phiên bản mới nhất, không cần lưu phiên bản mới.");
  revalidatePath("/", "layout");
  const [regulation, versions] = await Promise.all([getLatestRegulation(), getRegulationVersions()]);
  return actionOk({ regulation, versions });
}

function dateRange(event: { startDate: string; endDate: string }) {
  return event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`;
}

function revalidateCalendar() {
  revalidatePath("/administrator/settings/calendar");
  revalidatePath("/");
}

export async function saveCalendarEvent(id: string | null, input: CalendarEventInput): Promise<ActionResult<CalendarEvent>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  if (id !== null && !isUuid(id)) return actionError("Mốc lịch không còn tồn tại hoặc lấy từ học kỳ, đợt đăng ký (sửa ở trang Học kỳ).");
  const parsed = parseInput(CALENDAR_EVENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  let saved: CalendarEvent | string | undefined;
  try {
    saved = await db.transaction(async (tx) => {
      const [term] = await tx.select({ shortName: terms.shortName, startDate: terms.startDate, endDate: terms.endDate }).from(terms).where(eq(terms.id, values.termId));
      if (!term) return undefined;
      const outside = calendarEventTermReason(values, term);
      if (outside) return outside;
      const [existing] = id ? await tx.select(CALENDAR_EVENT_COLUMNS).from(calendarEvents).where(eq(calendarEvents.id, id)).for("update") : [];
      if (id && !existing) return undefined;
      const [row] = existing
        ? await tx.update(calendarEvents).set(values).where(eq(calendarEvents.id, existing.id)).returning(CALENDAR_EVENT_COLUMNS)
        : await tx.insert(calendarEvents).values(values).returning(CALENDAR_EVENT_COLUMNS);
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: existing ? "update" : "create",
        entityType: "calendar-event",
        entityId: row.id,
        entityLabel: `${row.title} (${term.shortName})`,
        summary: existing ? "Sửa mốc lịch năm học" : "Thêm mốc lịch năm học",
        changes: existing
          ? auditChanges([
              ["Tên mốc", existing.title, row.title],
              ["Loại", CALENDAR_EVENT_LABEL[existing.kind], CALENDAR_EVENT_LABEL[row.kind]],
              ["Thời gian", dateRange(existing), dateRange(row)],
              ["Đối tượng", existing.audience, row.audience],
            ])
          : [],
      });
      return { ...row, source: "manual" as const };
    });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  if (typeof saved === "string") return actionError(saved, { endDate: saved });
  if (!saved) return actionError("Mốc lịch hoặc học kỳ không còn tồn tại, tải lại trang.");
  revalidateCalendar();
  return actionOk(saved);
}

export async function deleteCalendarEvent(id: string): Promise<ActionResult<string>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  if (!isUuid(id)) return actionError("Mốc lấy từ học kỳ, đợt đăng ký không xóa được ở đây; sửa ở trang Học kỳ.");
  let deleted: { title: string } | undefined;
  try {
    deleted = await db.transaction(async (tx) => {
      const [row] = await tx.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning({ title: calendarEvents.title, startDate: calendarEvents.startDate, endDate: calendarEvents.endDate });
      if (!row) return undefined;
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "delete",
        entityType: "calendar-event",
        entityId: id,
        entityLabel: row.title,
        summary: `Xóa mốc lịch năm học (${dateRange(row)})`,
      });
      return row;
    });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  if (!deleted) return actionError("Mốc lịch không còn tồn tại, tải lại trang.");
  revalidateCalendar();
  return actionOk(id);
}

function reportOf(viewer: Viewer, reportKey: string) {
  const report = REPORT_DEFINITIONS.find((entry) => entry.id === reportKey);
  if (!report) return { report: null, denied: "Báo cáo không có trong danh mục." };
  if (!can(viewer, report.permission)) return { report, denied: `${report.name} cần quyền "${PERMISSION_LABEL[report.permission]}".` };
  return { report, denied: null };
}

export async function requestReportExport(input: ReportExportInput): Promise<ActionResult<ReportExportJob>> {
  const viewer = await requirePermission("reports.view");
  const parsed = parseInput(REPORT_EXPORT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { reportKey, termId, faculty, format } = parsed.data;
  const { report, denied } = reportOf(viewer, reportKey);
  if (!report || denied) return actionError(denied ?? "Báo cáo không có trong danh mục.");
  if (viewer.faculty && faculty !== viewer.faculty) return actionError("Bạn chỉ xuất được báo cáo của khoa mình.", { faculty: `Chỉ chọn được ${viewer.faculty}` });
  const [term] = await db.select({ code: terms.code, name: terms.name, shortName: terms.shortName }).from(terms).where(eq(terms.id, termId));
  if (!term) return actionError("Học kỳ không còn trong danh mục, tải lại trang.");
  if (faculty !== "all") {
    const [found] = await db.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty));
    if (!found) return actionError("Khoa không còn trong danh mục, tải lại trang.", { faculty: "Khoa không còn" });
  }
  const table = await getReportTable(reportKey, termId, faculty);
  if (!table) return actionError("Học kỳ không còn trong danh mục, tải lại trang.");
  const scope = faculty === "all" ? "Toàn trường" : faculty;
  const exportedOn = schoolTime().format("YYYY-MM-DD");
  const file = await buildReportFile(table, { title: report.name, subtitle: [report.usesTerm ? term.name : `Số liệu ngày ${formatDate(exportedOn)}`, scope].join(" · ") }, format);
  const fileName = reportFileName(reportKey, report.usesTerm ? term.code : null, format, exportedOn);
  const jobId = newId();
  const storageKey = newStorageKey("reports", jobId);
  const rowCount = table.rows.length;
  try {
    await withStoredFiles([{ key: storageKey, data: file.data, name: fileName }], () =>
      db.transaction(async (tx) => {
        await tx.insert(reportExports).values({
          id: jobId,
          reportKey,
          params: { termId, faculty, format },
          status: "done",
          requestedByUserId: viewer.id,
          rowCount,
          storageKey,
          fileName,
          contentType: file.contentType,
          sizeBytes: file.data.byteLength,
          finishedAt: new Date(),
        });
        await recordAudit(tx, {
          actor: auditActorOf(viewer),
          action: "export",
          entityType: "report",
          entityId: jobId,
          entityLabel: report.name,
          summary: `Xuất ${rowCount} dòng ra ${format.toUpperCase()}${report.usesTerm ? `, ${term.shortName}` : ""}, ${faculty === "all" ? "toàn trường" : faculty}`,
        });
      }),
    );
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/administrator/reports/exports");
  const [job] = await getReportExports(jobId);
  return job ? actionOk(job) : actionError("Đã tạo báo cáo nhưng chưa đọc lại được, tải lại trang.");
}

export async function downloadReportExport(id: string): Promise<ActionResult<{ fileName: string; content: string; encoding: "base64" | "text"; mimeType: string }>> {
  const viewer = await requirePermission("reports.view");
  if (!isUuid(id)) return actionError("Không tìm thấy báo cáo.");
  const [job] = await db
    .select({ reportKey: reportExports.reportKey, params: reportExports.params, status: reportExports.status, storageKey: reportExports.storageKey, fileName: reportExports.fileName, contentType: reportExports.contentType })
    .from(reportExports)
    .where(eq(reportExports.id, id));
  if (!job || job.status !== "done" || !job.storageKey) return actionError("Báo cáo chưa sẵn sàng hoặc đã bị xóa, tải lại trang.");
  const { report, denied } = reportOf(viewer, job.reportKey);
  if (!report || denied) return actionError(denied ?? "Báo cáo không có trong danh mục.");
  const faculty = (job.params as Partial<ReportParams>).faculty ?? "all";
  if (viewer.faculty && faculty !== viewer.faculty) return actionError("Bạn chỉ tải được báo cáo của khoa mình.");
  const data = await readFile(job.storageKey);
  if (!data) return actionError("Tệp báo cáo không còn trong kho (đã quá thời hạn lưu), xuất lại báo cáo.");
  try {
    await recordAudit(db, { actor: auditActorOf(viewer), action: "download", entityType: "report", entityId: id, entityLabel: report.name, summary: `Tải tệp ${job.fileName}` });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  const mimeType = job.contentType ?? "application/octet-stream";
  if (mimeType.startsWith("text/csv")) return actionOk({ fileName: job.fileName!, content: new TextDecoder().decode(data).replace(/^﻿/, ""), encoding: "text", mimeType });
  return actionOk({ fileName: job.fileName!, content: bytesToBase64(data), encoding: "base64", mimeType });
}
