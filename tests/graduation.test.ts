import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { GRADUATION_CONSTRAINT_MESSAGE } from "@/modules/graduation/graduation.constant";
import { evaluateGraduation, GRADUATION_APPROVE_SCHEMA } from "@/modules/graduation/graduation.rule";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import type { GraduationInput } from "@/modules/graduation/graduation.type";

after(() => db.$client.end());

const eligible: GraduationInput = {
  studentId: "0192f3a4-0000-7000-8000-000000000000",
  languageCertificate: "VSTEP B1",
  itCertificate: "IC3",
  tuitionCleared: true,
  disciplineFree: true,
  code: "48.01.104.007",
  fullName: "Sinh viên mẫu",
  className: "48.01.CNTT.A",
  faculty: "Khoa Công nghệ Thông tin",
  majorName: "Công nghệ thông tin",
  earnedCredits: 130,
  requiredCredits: 130,
  cpa4: 3.25,
  failedCredits: 0,
  alreadyGraduated: false,
  isApproved: false,
};

describe("graduation: xét điều kiện", () => {
  test("đủ mọi điều kiện thì đủ điều kiện, xếp loại theo CPA", () => {
    const candidate = evaluateGraduation(eligible);
    assert.equal(candidate.status, "eligible");
    assert.equal(candidate.classification, "Giỏi");
    assert.ok(candidate.checks.every((check) => check.passed));
  });

  test("thiếu một điều kiện là chưa đủ, ghi rõ điều kiện chưa đạt", () => {
    const candidate = evaluateGraduation({ ...eligible, earnedCredits: 126, languageCertificate: null, tuitionCleared: false });
    assert.equal(candidate.status, "missing");
    assert.deepEqual(
      candidate.checks.filter((check) => !check.passed).map((check) => check.key),
      ["credits", "language", "tuition"],
    );
    assert.equal(evaluateGraduation({ ...eligible, cpa4: 1.99 }).status, "missing");
    assert.equal(evaluateGraduation({ ...eligible, failedCredits: 3 }).status, "missing");
  });

  test("đã được hội đồng công nhận hoặc đã tốt nghiệp thì giữ trạng thái đó", () => {
    assert.equal(evaluateGraduation({ ...eligible, isApproved: true }).status, "approved");
    assert.equal(evaluateGraduation({ ...eligible, alreadyGraduated: true, isApproved: true }).status, "graduated");
  });

  test("danh sách trình hội đồng phải có sinh viên, id hợp lệ, bỏ trùng", () => {
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [] }).ok);
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: ["sv-1"] }).ok);
    const parsed = parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [eligible.studentId, eligible.studentId] });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.studentIds.length, 1);
  });
});

describe("graduation: ràng buộc ở DB", () => {
  test("hồ sơ đã công nhận phải có thời điểm quyết định", async () => {
    const [record] = await db.select().from(graduationRecords).where(eq(graduationRecords.status, "pending")).limit(1);
    const error = await db
      .update(graduationRecords)
      .set({ status: "approved" })
      .where(eq(graduationRecords.id, record.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, GRADUATION_CONSTRAINT_MESSAGE), GRADUATION_CONSTRAINT_MESSAGE.graduation_records_decided_fields);
  });
});
