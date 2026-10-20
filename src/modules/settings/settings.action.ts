"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { formatDate, schoolToday } from "@/shared/libs/date.lib";
import { toCsv } from "@/shared/libs/download.lib";
import { buildSpreadsheet, bytesToBase64, XLSX_MIME } from "@/shared/libs/spreadsheet.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { buildTablePdf, PDF_MIME } from "@/shared/libs/pdf.lib";
import { requirePermission, requireSchoolWidePermission } from "@/modules/access/access.query";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { auditChanges } from "@/modules/audit/audit.rule";
import { terms } from "@/modules/course-registration/course-registration.schema";
import { faculties } from "@/modules/curriculum/curriculum.schema";
import { CALENDAR_EVENT_LABEL, REPORT_DEFINITIONS, SETTINGS_CONSTRAINT_MESSAGE } from "@/modules/settings/settings.constant";
import { CALENDAR_EVENT_COLUMNS, getLatestRegulation, getRegulationVersions, getReportExports, getReportTable, type ReportParams } from "@/modules/settings/settings.query";
import {
  CALENDAR_EVENT_SCHEMA,
  nextRegulationVersion,
  REGULATION_SAVE_SCHEMA,
  regulationChanges,
  REPORT_EXPORT_SCHEMA,
  reportCellText,
  reportFileName,
  type CalendarEventInput,
  type RegulationSaveInput,
  type ReportExportInput,
} from "@/modules/settings/settings.rule";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";
import type { CalendarEvent, RegulationSettings, RegulationVersion, ReportExportJob } from "@/modules/settings/settings.type";

// Mỗi lần lưu tạo một phiên bản quy chế mới có ngày áp dụng; bản cũ giữ nguyên để tra cứu điểm, cảnh báo đã xét theo bản cũ.
export async function saveRegulation(input: RegulationSaveInput): Promise<ActionResult<{ regulation: RegulationSettings; versions: RegulationVersion[] }>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  const parsed = parseInput(REGULATION_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { rules, decision, reason, effectiveFrom } = parsed.data;
  if (effectiveFrom < schoolToday()) return actionError("Ngày áp dụng không được trước hôm nay.", { effectiveFrom: "Không được trước hôm nay" });
  let outcome: "unchanged" | "saved";
  try {
    outcome = await db.transaction(async (tx) => {
      // Khóa bảng quy chế trong giao dịch để hai người lưu cùng lúc không sinh trùng số hiệu phiên bản.
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
  // Quy chế dùng ở hầu hết các cổng (đăng ký, điểm danh, lịch thi).
  revalidatePath("/", "layout");
  const [regulation, versions] = await Promise.all([getLatestRegulation(), getRegulationVersions()]);
  return actionOk({ regulation, versions });
}

function dateRange(event: { startDate: string; endDate: string }) {
  return event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`;
}

export async function saveCalendarEvent(id: string | null, input: CalendarEventInput): Promise<ActionResult<CalendarEvent>> {
  const viewer = await requireSchoolWidePermission("settings.manage");
  if (id !== null && !isUuid(id)) return actionError("Mốc lịch không còn tồn tại, tải lại trang.");
  const parsed = parseInput(CALENDAR_EVENT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const values = parsed.data;
  let saved: CalendarEvent | undefined;
  try {
    saved = await db.transaction(async (tx) => {
      const [term] = await tx.select({ shortName: terms.shortName }).from(terms).where(eq(terms.id, values.termId));
      if (!term) return undefined;
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
      return row;
    });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  if (!saved) return actionError("Mốc lịch hoặc học kỳ không còn tồn tại, tải lại trang.");
  revalidatePath("/administrator/settings/calendar");
  revalidatePath("/");
  return actionOk(saved);
}

// Tạo báo cáo ngay trong request (dữ liệu còn nhỏ): đếm số dòng và ghi lịch sử xuất; tệp tạo lại khi tải về (downloadReportExport).
// Khi có hàng đợi tác vụ nền và kho lưu tệp thì chỉ ghi dòng queued ở đây.
export async function requestReportExport(input: ReportExportInput): Promise<ActionResult<ReportExportJob>> {
  const viewer = await requirePermission("reports.view");
  const parsed = parseInput(REPORT_EXPORT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { reportKey, termId, faculty, format } = parsed.data;
  // Cán bộ theo khoa chỉ xuất được dữ liệu khoa mình.
  if (viewer.faculty && faculty !== viewer.faculty) return actionError("Bạn chỉ xuất được báo cáo của khoa mình.", { faculty: `Chỉ chọn được ${viewer.faculty}` });
  const report = REPORT_DEFINITIONS.find((entry) => entry.id === reportKey)!;
  const table = await getReportTable(reportKey, termId, faculty);
  if (!table) return actionError("Học kỳ không còn trong danh mục, tải lại trang.");
  const rowCount = table.rows.length;
  let jobId: string | undefined;
  try {
    jobId = await db.transaction(async (tx) => {
      const [term] = await tx.select({ shortName: terms.shortName }).from(terms).where(eq(terms.id, termId));
      if (!term) return undefined;
      if (faculty !== "all") {
        const [found] = await tx.select({ id: faculties.id }).from(faculties).where(eq(faculties.name, faculty));
        if (!found) return undefined;
      }
      const [job] = await tx
        .insert(reportExports)
        .values({ reportKey, params: { termId, faculty, format }, status: "running", requestedByUserId: viewer.id })
        .returning({ id: reportExports.id });
      await tx
        .update(reportExports)
        .set({ status: "done", rowCount, storageKey: `reports/${job.id}.${format}`, finishedAt: new Date() })
        .where(eq(reportExports.id, job.id));
      await recordAudit(tx, {
        actor: auditActorOf(viewer),
        action: "export",
        entityType: "report",
        entityId: job.id,
        entityLabel: report.name,
        summary: `Xuất ${rowCount} dòng ra ${format.toUpperCase()}, ${term.shortName}, ${faculty === "all" ? "toàn trường" : faculty}`,
      });
      return job.id;
    });
  } catch (error) {
    return actionFailure(error, SETTINGS_CONSTRAINT_MESSAGE);
  }
  if (!jobId) return actionError("Học kỳ hoặc khoa không còn trong danh mục, tải lại trang.");
  revalidatePath("/administrator/reports/exports");
  const [job] = await getReportExports(jobId);
  return job ? actionOk(job) : actionError("Đã tạo báo cáo nhưng chưa đọc lại được, tải lại trang.");
}

// Tải báo cáo đã xuất: đọc lại dữ liệu theo đúng tham số lúc xuất, tạo tệp theo định dạng đã chọn để trình duyệt lưu.
// Excel, PDF trả base64 (server action chỉ truyền được dữ liệu tuần tự hóa), CSV trả chữ.
export async function downloadReportExport(id: string): Promise<ActionResult<{ fileName: string; content: string; encoding: "base64" | "text"; mimeType: string }>> {
  const viewer = await requirePermission("reports.view");
  if (!isUuid(id)) return actionError("Không tìm thấy báo cáo.");
  const [job] = await db
    .select({ reportKey: reportExports.reportKey, params: reportExports.params, status: reportExports.status })
    .from(reportExports)
    .where(eq(reportExports.id, id));
  if (!job || job.status !== "done") return actionError("Báo cáo chưa sẵn sàng hoặc đã bị xóa, tải lại trang.");
  const params = job.params as Partial<ReportParams>;
  const faculty = params.faculty ?? "all";
  if (viewer.faculty && faculty !== viewer.faculty) return actionError("Bạn chỉ tải được báo cáo của khoa mình.");
  const table = params.termId ? await getReportTable(job.reportKey, params.termId, faculty) : null;
  if (!table) return actionError("Học kỳ của báo cáo không còn trong danh mục.");
  const [term] = await db.select({ code: terms.code, name: terms.name }).from(terms).where(eq(terms.id, params.termId!));
  const fileName = reportFileName(job.reportKey, term?.code ?? "hoc-ky", params.format);
  const report = REPORT_DEFINITIONS.find((entry) => entry.id === job.reportKey);
  if (params.format === "pdf") {
    const bytes = await buildTablePdf({
      title: report?.name ?? job.reportKey,
      subtitle: [term?.name, faculty === "all" ? "Toàn trường" : faculty].filter(Boolean).join(" · "),
      unit: "Phòng Đào tạo",
      header: table.header,
      rows: table.rows.map((row) => row.map(reportCellText)),
    });
    return actionOk({ fileName, content: bytesToBase64(bytes), encoding: "base64", mimeType: PDF_MIME });
  }
  if (params.format === "xlsx") {
    const bytes = await buildSpreadsheet(
      report?.name ?? job.reportKey,
      table.header.map((header) => ({ header, text: /^(MSSV|Mã)/.test(header) })),
      table.rows,
    );
    return actionOk({ fileName, content: bytesToBase64(bytes), encoding: "base64", mimeType: XLSX_MIME });
  }
  return actionOk({ fileName, content: toCsv([table.header, ...table.rows.map((row) => row.map(reportCellText))]), encoding: "text", mimeType: "text/csv;charset=utf-8" });
}
