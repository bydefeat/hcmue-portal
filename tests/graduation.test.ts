import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { GRADUATION_CONSTRAINT_MESSAGE } from "@/modules/graduation/graduation.constant";
import { GRADUATION_ROUND } from "@/modules/graduation/graduation.mock";
import { loadGraduationCandidates } from "@/modules/graduation/graduation.lib";
import {
  evaluateGraduation,
  GRADUATION_APPROVE_SCHEMA,
  GRADUATION_CERTIFICATES_SCHEMA,
  GRADUATION_ROUND_SCHEMA,
  graduationRank,
  meetsLanguageLevel,
} from "@/modules/graduation/graduation.rule";
import { graduationRecords, graduationRounds } from "@/modules/graduation/graduation.schema";
import type { GraduationInput } from "@/modules/graduation/graduation.type";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";

after(() => db.$client.end());

const RULES = REGULATION_RULES;

const eligible: GraduationInput = {
  studentId: "0192f3a4-0000-7000-8000-000000000000",
  languageCertificate: "VSTEP B1",
  languageLevel: "B1",
  itCertificate: "IC3",
  certificatesVerifiedAt: null,
  code: "48.01.104.007",
  fullName: "Sinh viên mẫu",
  className: "48.01.CNTT.A",
  faculty: "Khoa Công nghệ Thông tin",
  majorName: "Công nghệ thông tin",
  cohort: 48,
  program: { name: "Công nghệ thông tin", totalCredits: 130 },
  earnedCredits: 130,
  cpa4: 3.25,
  failedCredits: 0,
  retakeCredits: 0,
  missingRequired: [],
  missingConditional: [],
  electives: [],
  outstandingTuition: 0,
  disciplines: [],
  alreadyGraduated: false,
  isApproved: false,
};

class Rollback extends Error {}

async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

describe("graduation: xét điều kiện", () => {
  test("đủ mọi điều kiện thì đủ điều kiện, hạng theo ngưỡng CPA của quy chế", () => {
    const candidate = evaluateGraduation(eligible, RULES);
    assert.equal(candidate.status, "eligible");
    assert.equal(candidate.classification, "Giỏi");
    assert.equal(candidate.requiredCredits, 130);
    assert.ok(candidate.checks.every((check) => check.passed));
  });

  test("thiếu một điều kiện là chưa đủ, ghi rõ điều kiện chưa đạt", () => {
    const candidate = evaluateGraduation({ ...eligible, earnedCredits: 126, languageCertificate: null, languageLevel: null, outstandingTuition: 1_500_000 }, RULES);
    assert.equal(candidate.status, "missing");
    assert.deepEqual(
      candidate.checks.filter((check) => !check.passed).map((check) => check.key),
      ["credits", "language", "tuition"],
    );
    assert.equal(evaluateGraduation({ ...eligible, cpa4: 1.99 }, RULES).status, "missing");
    assert.equal(evaluateGraduation({ ...eligible, cpa4: 1.99 }, RULES).classification, "Không xếp loại");
    assert.equal(evaluateGraduation({ ...eligible, failedCredits: 3 }, RULES).status, "missing");
  });

  test("tín chỉ theo tổng tín chỉ khung của đúng chương trình (không giới hạn cứng), thiếu học phần bắt buộc là chưa đạt", () => {
    const large = evaluateGraduation({ ...eligible, program: { name: "Sư phạm Toán học", totalCredits: 135 }, earnedCredits: 130 }, RULES);
    assert.equal(large.requiredCredits, 135);
    assert.equal(large.checks.find((check) => check.key === "credits")?.passed, false);
    const missing = evaluateGraduation({ ...eligible, missingRequired: [{ code: "MATH4990", name: "Khóa luận tốt nghiệp" }] }, RULES);
    const required = missing.checks.find((check) => check.key === "required")!;
    assert.equal(required.passed, false);
    assert.equal(required.detail, "Còn thiếu 1 học phần: MATH4990 Khóa luận tốt nghiệp");
    const noProgram = evaluateGraduation({ ...eligible, program: null }, RULES);
    assert.equal(noProgram.status, "missing");
    assert.equal(noProgram.checks.find((check) => check.key === "program")?.passed, false);
  });

  test("chuẩn ngoại ngữ theo bậc tối thiểu của quy chế; tin học theo quy chế có bắt buộc hay không", () => {
    assert.ok(meetsLanguageLevel("B2", "B1"));
    assert.ok(!meetsLanguageLevel("A2", "B1"));
    assert.ok(!meetsLanguageLevel(null, "A1"));
    const a2 = evaluateGraduation({ ...eligible, languageCertificate: "TOEIC 450", languageLevel: "A2" }, RULES);
    assert.equal(a2.checks.find((check) => check.key === "language")?.detail, "TOEIC 450, bậc A2, dưới chuẩn B1");
    const b2Rule = { ...RULES, graduation: { ...RULES.graduation, languageMinLevel: "B2" as const } };
    assert.equal(evaluateGraduation(eligible, b2Rule).status, "missing");
    const noIt = { ...eligible, itCertificate: null };
    assert.equal(evaluateGraduation(noIt, RULES).status, "missing");
    assert.equal(evaluateGraduation(noIt, { ...RULES, graduation: { ...RULES.graduation, requireItCertificate: false } }).status, "eligible");
  });

  test("giảm một hạng khi học lại vượt tỉ lệ quy chế hoặc bị kỷ luật từ mức đã định; chỉ áp với hạng quy chế chọn", () => {
    const excellent = { ...eligible, cpa4: 3.7 };
    assert.equal(graduationRank({ ...excellent, retakeCredits: 6 }, RULES).rank, "excellent");
    const retaken = graduationRank({ ...excellent, retakeCredits: 7 }, RULES);
    assert.deepEqual([retaken.baseRank, retaken.rank], ["excellent", "very-good"]);
    assert.equal(retaken.reasons[0], "Học lại 7 tín chỉ, vượt 5% tổng 130 tín chỉ của chương trình");
    const warned = evaluateGraduation({ ...eligible, disciplines: [{ title: "Cảnh cáo do vi phạm", level: "warning", effectiveDate: "2025-01-01" }] }, RULES);
    assert.deepEqual([warned.status, warned.classification], ["eligible", "Khá"]);
    assert.equal(graduationRank({ ...eligible, disciplines: [{ title: "Khiển trách", level: "reprimand", effectiveDate: "2025-01-01" }] }, RULES).rank, "very-good");
    assert.equal(graduationRank({ ...eligible, cpa4: 2.8, retakeCredits: 30 }, RULES).rank, "good");
    const wider = { ...RULES, graduation: { ...RULES.graduation, downgradeStandings: ["excellent" as const, "very-good" as const, "good" as const], retakeLimitPercent: 10 } };
    assert.equal(graduationRank({ ...eligible, cpa4: 2.8, retakeCredits: 14 }, wider).rank, "average");
    assert.equal(graduationRank({ ...excellent, retakeCredits: 7 }, wider).rank, "excellent");
  });

  test("đình chỉ học tập đang hiệu lực chặn tốt nghiệp", () => {
    const suspended = evaluateGraduation({ ...eligible, disciplines: [{ title: "Đình chỉ", level: "suspension", effectiveDate: "2026-01-01" }] }, RULES);
    assert.equal(suspended.status, "missing");
    assert.equal(suspended.checks.find((check) => check.key === "discipline")?.passed, false);
  });

  test("đã được hội đồng công nhận hoặc đã tốt nghiệp thì giữ trạng thái đó", () => {
    assert.equal(evaluateGraduation({ ...eligible, isApproved: true }, RULES).status, "approved");
    assert.equal(evaluateGraduation({ ...eligible, alreadyGraduated: true, isApproved: true }, RULES).status, "graduated");
  });

  test("danh sách trình hội đồng, đợt xét, chứng chỉ: kiểm dữ liệu vào", () => {
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [] }).ok);
    assert.ok(!parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: ["sv-1"] }).ok);
    const parsed = parseInput(GRADUATION_APPROVE_SCHEMA, { studentIds: [eligible.studentId, eligible.studentId] });
    assert.ok(parsed.ok && parsed.data.studentIds.length === 1);
    const round = parseInput(GRADUATION_ROUND_SCHEMA, { name: " Đợt tháng 6 ", cohorts: [49, 48, 48] });
    assert.ok(round.ok && round.data.name === "Đợt tháng 6" && round.data.cohorts.join() === "48,49");
    assert.ok(!parseInput(GRADUATION_ROUND_SCHEMA, { name: "Đợt", cohorts: [] }).ok);
    const certificate = parseInput(GRADUATION_CERTIFICATES_SCHEMA, { studentId: eligible.studentId, languageCertificate: "IELTS 6.0", languageLevel: null, itCertificate: "" });
    assert.ok(!certificate.ok && certificate.fieldErrors?.languageLevel);
    const cleared = parseInput(GRADUATION_CERTIFICATES_SCHEMA, { studentId: eligible.studentId, languageCertificate: "", languageLevel: "B2", itCertificate: " " });
    assert.ok(cleared.ok && cleared.data.languageLevel === null && cleared.data.itCertificate === null);
  });
});

describe("graduation: ràng buộc ở DB", () => {
  test("hồ sơ đã công nhận phải có thời điểm quyết định; bậc ngoại ngữ trong khung", async () => {
    const [record] = await db.select().from(graduationRecords).where(eq(graduationRecords.status, "pending")).limit(1);
    const error = await db
      .update(graduationRecords)
      .set({ status: "approved" })
      .where(eq(graduationRecords.id, record.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, GRADUATION_CONSTRAINT_MESSAGE), GRADUATION_CONSTRAINT_MESSAGE.graduation_records_decided_fields);
    const level = await db
      .update(graduationRecords)
      .set({ languageLevel: "B3" })
      .where(eq(graduationRecords.id, record.id))
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(level, GRADUATION_CONSTRAINT_MESSAGE), GRADUATION_CONSTRAINT_MESSAGE.graduation_records_language_level);
  });

  test("chỉ một đợt xét tốt nghiệp mở một lúc", async () => {
    const error = await db
      .insert(graduationRounds)
      .values({ name: "Đợt thử", cohorts: [49] })
      .then(() => null)
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, GRADUATION_CONSTRAINT_MESSAGE), GRADUATION_CONSTRAINT_MESSAGE.graduation_rounds_single_open);
  });
});

describe("graduation: dữ liệu mẫu theo đợt đang mở", () => {
  test("khóa theo đợt xét đang mở; mỗi ngành có sinh viên đủ điều kiện; khung lớn hơn 130 tín chỉ thì đòi đủ khung", async () => {
    const { round, candidates } = await loadGraduationCandidates({ faculty: null });
    assert.deepEqual(round?.cohorts, GRADUATION_ROUND.cohorts);
    assert.ok(candidates.length > 0 && candidates.every((candidate) => candidate.cohort === 48));
    const eligibleByMajor = new Map<string, number>();
    for (const candidate of candidates) eligibleByMajor.set(candidate.majorName, (eligibleByMajor.get(candidate.majorName) ?? 0) + (candidate.status === "eligible" ? 1 : 0));
    assert.equal(eligibleByMajor.size, 6);
    const math = candidates.filter((candidate) => candidate.majorName === "Sư phạm Toán học" && candidate.status === "missing");
    assert.ok(math.length > 0 && math.every((candidate) => candidate.requiredCredits === 135));
    assert.ok(math.some((candidate) => candidate.missingRequired.some((course) => course.code === "MATH4990")));
    for (const [major, total] of eligibleByMajor) if (major !== "Sư phạm Toán học") assert.ok(total > 0, `${major} không có sinh viên đủ điều kiện`);
  });

  test("đổi khóa của đợt xét thì danh sách đổi theo; đóng đợt thì không còn danh sách", async () => {
    await inRollback(async (tx) => {
      await tx.update(graduationRounds).set({ cohorts: [49] }).where(eq(graduationRounds.isOpen, true));
      const { candidates } = await loadGraduationCandidates({ faculty: null }, tx);
      assert.ok(candidates.length > 0 && candidates.every((candidate) => candidate.cohort === 49));
      await tx.update(graduationRounds).set({ isOpen: false }).where(eq(graduationRounds.isOpen, true));
      const closed = await loadGraduationCandidates({ faculty: null }, tx);
      assert.equal(closed.round, null);
      assert.equal(closed.candidates.length, 0);
    });
  });
});
