import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { SETTINGS_CONSTRAINT_MESSAGE } from "@/modules/settings/settings.constant";
import { REGULATION, REGULATION_RULES } from "@/modules/settings/settings.mock";
import { regulationAt } from "@/modules/settings/settings.lib";
import { CALENDAR_EVENT_SCHEMA, nextRegulationVersion, REGULATION_RULES_SCHEMA, REGULATION_SAVE_SCHEMA, regulationChanges, REPORT_EXPORT_SCHEMA, reportCellText, reportFileName } from "@/modules/settings/settings.rule";
import { buildSpreadsheet, readSpreadsheet } from "@/shared/libs/spreadsheet.lib";
import ExcelJS from "exceljs";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";

after(() => db.$client.end());

const rules = REGULATION_RULES;
const save = (next: unknown) => parseInput(REGULATION_SAVE_SCHEMA, { rules: next, decision: "1/QĐ", reason: "Thử", effectiveFrom: "2027-01-01" });
const { grading, credits, warning } = rules;

describe("settings: quy chế đào tạo", () => {
  test("quy chế mẫu hợp lệ", () => {
    assert.ok(REGULATION_RULES_SCHEMA.safeParse(rules).success);
  });

  test("thang điểm phải giảm dần và bắt đầu từ 0, hạn mức tối thiểu không vượt tối đa", () => {
    const unsorted = { ...rules, grading: { ...grading, scale: [grading.scale[1], grading.scale[0], ...grading.scale.slice(2)] } };
    const parsed = parseInput(REGULATION_SAVE_SCHEMA, { rules: unsorted, decision: "1/QĐ", reason: "Thử", effectiveFrom: "2027-01-01" });
    assert.ok(!parsed.ok && parsed.fieldErrors?.["rules.grading.scale"]);
    const capped = parseInput(REGULATION_SAVE_SCHEMA, { rules: { ...rules, credits: { ...credits, minPerTerm: 30 } }, decision: "1/QĐ", reason: "Thử", effectiveFrom: "2027-01-01" });
    assert.ok(!capped.ok && capped.fieldErrors?.["rules.credits.maxPerTerm"]);
    const missing = parseInput(REGULATION_SAVE_SCHEMA, { rules, decision: " ", reason: "", effectiveFrom: "01/01/2027" });
    assert.deepEqual(Object.keys(!missing.ok ? (missing.fieldErrors ?? {}) : {}).toSorted(), ["decision", "effectiveFrom", "reason"]);
  });

  test("thang điểm phải kết thúc bằng F từ 0, ngưỡng một chữ số thập phân; bước làm tròn 0,1, 0,5 hoặc 1; ngưỡng xếp loại giảm dần", () => {
    const twoDigits = save({ ...rules, grading: { ...grading, scale: grading.scale.map((step) => (step.letter === "A" ? { ...step, min: 8.55 } : step)) } });
    assert.ok(!twoDigits.ok && twoDigits.fieldErrors?.["rules.grading.scale"]);
    const rounding = save({ ...rules, grading: { ...grading, roundingStep: 0.25 } });
    assert.ok(!rounding.ok && rounding.fieldErrors?.["rules.grading.roundingStep"]);
    const standing = save({ ...rules, grading: { ...grading, standing: { ...grading.standing, good: 3.3 } } });
    assert.ok(!standing.ok && standing.fieldErrors?.["rules.grading.standing.good"]);
    const graduation = save({ ...rules, graduation: { ...rules.graduation, languageMinLevel: "B3" } });
    assert.ok(!graduation.ok && graduation.fieldErrors?.["rules.graduation.languageMinLevel"]);
    assert.ok(save({ ...rules, graduation: { ...rules.graduation, downgradeStandings: ["very-good", "excellent"] } }).ok);
  });

  test("bản quy chế áp dụng theo ngày: bản mới chỉ có hiệu lực từ ngày áp dụng", async () => {
    const at = await regulationAt(db, "2024-01-01");
    assert.equal(at.version, "2023.1");
    assert.equal((await regulationAt(db, "2026-10-20")).version, REGULATION.version);
    // Trước bản sớm nhất thì lấy bản sớm nhất.
    assert.equal((await regulationAt(db, "2000-01-01")).version, "2021.1");
  });

  test("số hiệu phiên bản tăng theo năm áp dụng", () => {
    assert.equal(nextRegulationVersion(["2025.1", "2026.1", "2026.2"], "2026-11-01"), "2026.3");
    assert.equal(nextRegulationVersion(["2025.1"], "2027-09-01"), "2027.1");
  });

  test("nhật ký ghi đúng tham số và mức điểm chữ thay đổi", () => {
    const next = { ...rules, warning: { ...warning, level2Cpa: 1.4 }, grading: { ...grading, scale: grading.scale.map((step) => (step.letter === "A" ? { ...step, min: 9 } : step)) } };
    assert.deepEqual(regulationChanges(rules, next), [
      { field: "Mức 2: CPA dưới", before: "1,5", after: "1,4" },
      { field: "Điểm A: từ điểm", before: "8,5", after: "9" },
    ]);
    const graduationChange = { ...rules, graduation: { ...rules.graduation, downgradeDisciplineLevel: "suspension" as const, downgradeStandings: ["excellent" as const] } };
    assert.deepEqual(regulationChanges(rules, graduationChange), [
      { field: "Giảm hạng khi bị kỷ luật từ mức", before: "Cảnh cáo", after: "Đình chỉ học tập có thời hạn" },
      { field: "Hạng tốt nghiệp bị giảm", before: "Xuất sắc, Giỏi", after: "Xuất sắc" },
    ]);
    // Bản cũ thiếu tham số mới vẫn so được.
    const { graduation: _graduation, ...older } = rules;
    assert.ok(regulationChanges(older as typeof rules, rules).some((change) => change.field === "Chuẩn ngoại ngữ tối thiểu" && change.before === "Không có"));
    assert.deepEqual(regulationChanges(rules, rules), []);
  });
});

describe("settings: lịch năm học", () => {
  test("ngày kết thúc không trước ngày bắt đầu", () => {
    const event = { termId: "0192f3a4-0000-7000-8000-000000000001", kind: "exam", title: " Thi ", startDate: "2027-01-10", endDate: "2027-01-04", audience: "Toàn trường" } as const;
    const parsed = parseInput(CALENDAR_EVENT_SCHEMA, event);
    assert.ok(!parsed.ok && parsed.fieldErrors?.endDate);
    const ok = parseInput(CALENDAR_EVENT_SCHEMA, { ...event, endDate: "2027-01-10" });
    assert.ok(ok.ok && ok.data.title === "Thi");
  });
});

describe("settings: ràng buộc ở DB", () => {
  test("hai bản quy chế không cùng ngày áp dụng", async () => {
    const [latest] = await db.select().from(regulations).limit(1);
    const error = await db
      .insert(regulations)
      .values({ version: "9999.1", effectiveFrom: latest.effectiveFrom, decision: "Thử", summary: "Thử", rules: latest.rules })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, SETTINGS_CONSTRAINT_MESSAGE), SETTINGS_CONSTRAINT_MESSAGE.regulations_effective_from_unique);
  });

  test("mốc lịch kết thúc trước khi bắt đầu bị chặn", async () => {
    const [event] = await db.select().from(calendarEvents).limit(1);
    const error = await db
      .update(calendarEvents)
      .set({ endDate: "2000-01-01" })
      .where(eq(calendarEvents.id, event.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, SETTINGS_CONSTRAINT_MESSAGE), SETTINGS_CONSTRAINT_MESSAGE.calendar_events_date_order);
  });

  test("báo cáo đã xong phải có tệp và số dòng", async () => {
    // Seed không có lịch sử xuất (mỗi lần xuất lưu tệp thật): báo cáo đã xong mà thiếu tệp bị chặn ngay khi ghi.
    const error = await db
      .insert(reportExports)
      .values({ reportKey: "moet", status: "done", rowCount: 1, fileName: "moet.csv", contentType: "text/csv", sizeBytes: 1, finishedAt: new Date() })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, SETTINGS_CONSTRAINT_MESSAGE), SETTINGS_CONSTRAINT_MESSAGE.report_exports_done_fields);
  });
});

describe("settings: xuất báo cáo Excel", () => {
  test("nhận định dạng xlsx, pdf và csv, tên tệp theo định dạng đã chọn", () => {
    const base = { reportKey: "registration", termId: "0192f3a4-0000-7000-8000-000000000001", faculty: "all" };
    assert.ok(parseInput(REPORT_EXPORT_SCHEMA, { ...base, format: "xlsx" }).ok);
    assert.ok(parseInput(REPORT_EXPORT_SCHEMA, { ...base, format: "pdf" }).ok);
    assert.ok(!parseInput(REPORT_EXPORT_SCHEMA, { ...base, format: "docx" }).ok);
    assert.equal(reportFileName("registration", "hk1-2026", "xlsx"), "registration-hk1-2026.xlsx");
    assert.equal(reportFileName("registration", "hk1-2026", "pdf"), "registration-hk1-2026.pdf");
    assert.equal(reportFileName("registration", "hk1-2026", undefined), "registration-hk1-2026.csv");
    // Báo cáo số liệu hiện tại không ghi mã học kỳ mà ghi ngày xuất.
    assert.equal(reportFileName("moet", null, "xlsx", "2026-10-20"), "moet-2026-10-20.xlsx");
    assert.equal(reportCellText({ value: 0.853, text: "85,3%", numFmt: "0.0%" }), "85,3%");
    assert.equal(reportCellText(42), 42);
  });

  test("tệp .xlsx: tiêu đề in đậm, cố định hàng tiêu đề, ô số là số, mã giữ dạng chữ", async () => {
    const bytes = await buildSpreadsheet(
      "Tỉ lệ đăng ký học phần",
      [{ header: "Mã lớp", text: true }, { header: "Chỉ tiêu" }, { header: "Tỉ lệ lấp đầy" }],
      [
        ["COMP1020.01", 60, { value: 0.853, numFmt: "0.0%" }],
        ["0123", 40, { value: 1, numFmt: "0.0%" }],
      ],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer);
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.getRow(1).font?.bold, true);
    assert.equal(sheet.views[0]?.state, "frozen");
    assert.equal(sheet.getCell("B2").value, 60);
    assert.equal(sheet.getCell("C2").value, 0.853);
    assert.equal(sheet.getCell("C2").numFmt, "0.0%");
    assert.equal(sheet.getCell("A3").value, "0123");
    assert.ok((sheet.getColumn(1).width ?? 0) >= 8);
    assert.deepEqual(await readSpreadsheet(bytes), [
      ["Mã lớp", "Chỉ tiêu", "Tỉ lệ lấp đầy"],
      ["COMP1020.01", "60", "0.85"],
      ["0123", "40", "1"],
    ]);
  });
});
