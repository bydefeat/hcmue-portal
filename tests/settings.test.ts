import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { SETTINGS_CONSTRAINT_MESSAGE } from "@/modules/settings/settings.constant";
import { REGULATION } from "@/modules/settings/settings.mock";
import { CALENDAR_EVENT_SCHEMA, nextRegulationVersion, REGULATION_RULES_SCHEMA, REGULATION_SAVE_SCHEMA, regulationChanges } from "@/modules/settings/settings.rule";
import { calendarEvents, regulations, reportExports } from "@/modules/settings/settings.schema";

after(() => db.$client.end());

const { grading, credits, warning, attendance, workflow } = REGULATION;
const rules = { grading, credits, warning, attendance, workflow };

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
    const [job] = await db.select().from(reportExports).where(eq(reportExports.status, "done")).limit(1);
    const error = await db
      .update(reportExports)
      .set({ storageKey: null })
      .where(eq(reportExports.id, job.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, SETTINGS_CONSTRAINT_MESSAGE), SETTINGS_CONSTRAINT_MESSAGE.report_exports_done_fields);
  });
});
