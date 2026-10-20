import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { newId } from "@/shared/libs/id.lib";
import { readSpreadsheet } from "@/shared/libs/spreadsheet.lib";
import { deleteFiles, isStorageKey, newStorageKey, putFile, readFile } from "@/shared/libs/storage.lib";
import { auditLogs } from "@/modules/audit/audit.schema";
import { purgeOldAuditLogs } from "@/modules/audit/audit.lib";
import { CALENDAR_TERM_MARGIN_DAYS, REPORT_DEFINITIONS } from "@/modules/settings/settings.constant";
import { buildReportFile, purgeReportExports } from "@/modules/settings/settings.lib";
import { CALENDAR_EVENT_SCHEMA, calendarEventTermReason } from "@/modules/settings/settings.rule";
import { parseCsv } from "@/shared/libs/download.lib";
import { reportExports } from "@/modules/settings/settings.schema";

const createdJobs: string[] = [];
const createdKeys: string[] = [];

after(async () => {
  if (createdJobs.length > 0) await db.delete(reportExports).where(inArray(reportExports.id, createdJobs));
  await deleteFiles(createdKeys);
  await db.$client.end();
});

const TABLE = {
  header: ["MSSV", "Họ và tên", "Tỉ lệ"],
  rows: [
    ["50.01.104.009", "Phạm Gia Đạt", { value: 0.5, text: "50,0%", numFmt: "0.0%" }],
    ["50.01.104.010", "=cmd", 3],
  ],
};

// Một lần xuất đã xong cách đây daysAgo ngày, có tệp thật trong kho.
async function makeExport(daysAgo: number) {
  const id = newId();
  const storageKey = newStorageKey("reports", id);
  await putFile(storageKey, new TextEncoder().encode("a,b\n1,2"));
  createdKeys.push(storageKey);
  createdJobs.push(id);
  const at = new Date(Date.now() - daysAgo * 24 * 3_600_000);
  await db.insert(reportExports).values({
    id,
    reportKey: "moet",
    params: { termId: "x", faculty: "all", format: "csv" },
    status: "done",
    rowCount: 1,
    storageKey,
    fileName: "moet.csv",
    contentType: "text/csv;charset=utf-8",
    sizeBytes: 7,
    createdAt: at,
    finishedAt: at,
  });
  return { id, storageKey };
}

describe("reports: tệp xuất lưu thật, tải đúng tệp đã lưu", () => {
  test("CSV có BOM, số dòng khớp bảng; Excel đọc lại đúng ô", async () => {
    const csv = await buildReportFile(TABLE, { title: "Thử", subtitle: "Toàn trường" }, "csv");
    const text = new TextDecoder().decode(csv.data);
    assert.deepEqual([...csv.data.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(parseCsv(text).length, TABLE.rows.length + 1);
    assert.match(text, /'=cmd/);
    const xlsx = await buildReportFile(TABLE, { title: "Thử", subtitle: "Toàn trường" }, "xlsx");
    const sheet = await readSpreadsheet(xlsx.data);
    assert.equal(sheet.length, TABLE.rows.length + 1);
    assert.equal(sheet[1][0], "50.01.104.009");
    const pdf = await buildReportFile(TABLE, { title: "Thử", subtitle: "Toàn trường" }, "pdf");
    assert.equal(new TextDecoder().decode(pdf.data.subarray(0, 5)), "%PDF-");
  });

  test("khóa lưu trữ reports/<uuid> hợp lệ; tác vụ report-exports xóa lịch sử quá 30 ngày cùng tệp, giữ bản mới", async () => {
    const key = newStorageKey("reports");
    assert.ok(isStorageKey(key) && key.startsWith("reports/"));
    assert.ok(!isStorageKey("reports/../x"));
    const old = await makeExport(40);
    const fresh = await makeExport(1);
    const outcome = await purgeReportExports();
    assert.ok(outcome.reportExportsRemoved >= 1);
    assert.equal((await db.select().from(reportExports).where(eq(reportExports.id, old.id))).length, 0);
    assert.equal(await readFile(old.storageKey), null);
    assert.equal((await db.select().from(reportExports).where(eq(reportExports.id, fresh.id))).length, 1);
    assert.ok(await readFile(fresh.storageKey));
  });

  test("báo cáo khảo sát cần surveys.view, xét tốt nghiệp cần graduation.manage; moet, graduation không theo học kỳ", () => {
    const byId = Object.fromEntries(REPORT_DEFINITIONS.map((report) => [report.id, report]));
    assert.equal(byId.surveys.permission, "surveys.view");
    assert.equal(byId.graduation.permission, "graduation.manage");
    assert.equal(byId.moet.usesTerm, false);
    assert.equal(byId.graduation.usesTerm, false);
    assert.equal(byId.registration.facultyBasis, "course");
    assert.equal(byId.standing.facultyBasis, "student");
  });
});

describe("lịch năm học: mốc tự nhập", () => {
  const term = { startDate: "2026-09-07", endDate: "2027-01-16", shortName: "HK1 2026-2027" };

  test("thời gian học kỳ, đợt đăng ký không nhập tay; mốc phải nằm trong học kỳ (giáp trước sau tối đa 31 ngày)", () => {
    const base = { termId: "0192f3a4-0000-7000-8000-000000000001", title: "Thi", startDate: "2027-01-04", endDate: "2027-01-10", audience: "Toàn trường" };
    assert.ok(!parseInput(CALENDAR_EVENT_SCHEMA, { ...base, kind: "teaching" }).ok);
    assert.ok(!parseInput(CALENDAR_EVENT_SCHEMA, { ...base, kind: "registration" }).ok);
    assert.ok(parseInput(CALENDAR_EVENT_SCHEMA, { ...base, kind: "exam" }).ok);
    assert.equal(calendarEventTermReason({ startDate: "2027-01-04", endDate: "2027-01-26" }, term), null);
    assert.equal(calendarEventTermReason({ startDate: "2026-09-01", endDate: "2026-09-02" }, term), null);
    assert.match(calendarEventTermReason({ startDate: "2027-03-01", endDate: "2027-03-02" }, term) ?? "", /phải nằm trong HK1 2026-2027/);
    assert.match(calendarEventTermReason({ startDate: "2026-07-01", endDate: "2026-09-10" }, term) ?? "", new RegExp(`${CALENDAR_TERM_MARGIN_DAYS} ngày`));
  });
});

describe("audit: giữ nhật ký theo cấu hình", () => {
  test("tác vụ audit-cleanup chỉ xóa bản ghi cũ hơn số ngày giữ", async () => {
    await db
      .transaction(async (tx) => {
        const now = new Date("2026-10-20T00:00:00Z");
        const day = 24 * 3_600_000;
        const values = [400, 10].map((daysAgo) => ({
          at: new Date(now.getTime() - daysAgo * day),
          actorLabel: "Kiểm thử",
          actorRole: "Kiểm thử",
          action: "update" as const,
          entityType: "report" as const,
          entityId: `audit-retention-${daysAgo}`,
          entityLabel: "Kiểm thử giữ nhật ký",
          summary: "x",
        }));
        await tx.insert(auditLogs).values(values);
        const { auditLogsRemoved } = await purgeOldAuditLogs(tx, now, 365);
        assert.ok(auditLogsRemoved >= 1);
        const left = await tx.select({ entityId: auditLogs.entityId }).from(auditLogs).where(inArray(auditLogs.entityId, ["audit-retention-400", "audit-retention-10"]));
        assert.deepEqual(left.map((row) => row.entityId), ["audit-retention-10"]);
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
  });
});
