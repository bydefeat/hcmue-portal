import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { schoolTime } from "@/shared/libs/date.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ROLES } from "@/modules/access/access.mock";
import { auditLogs } from "@/modules/audit/audit.schema";
import { user } from "@/modules/authentication/authentication.schema";
import { majors } from "@/modules/curriculum/curriculum.schema";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { USERS_CONSTRAINT_MESSAGE } from "@/modules/users/users.constant";
import {
  createDecisionDraft,
  deleteDecisionDraft,
  returnDecision,
  revokeDecision,
  runDecisionEffectsJob,
  signDecision,
  submitDecision,
  updateDecisionDraft,
  type DecisionActor,
} from "@/modules/users/users.decision";
import { changesProfile, DECISION_SCHEMA, decisionBlockedReason, decisionEffect, revokeBlockedReason } from "@/modules/users/users.rule";
import { administrativeClasses, studentDecisions, students } from "@/modules/users/users.schema";
import type { StudentStatus } from "@/modules/users/users.type";

const day = (offset: number) => schoolTime().add(offset, "day").format("YYYY-MM-DD");

async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

async function rejected(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof Error, "phải báo lỗi");
  return error.message;
}

const input = (studentId: string, kind: "reserve" | "expel" | "major-change" | "discipline" | "graduate" | "resume", extra: Record<string, unknown> = {}) =>
  DECISION_SCHEMA.parse({ studentId, kind, title: `Quyết định thử ${kind}`, basis: "Đơn của sinh viên", effectiveDate: day(0), ...extra });

const statusOf = async (tx: Transaction, id: string) => (await tx.select({ status: students.status, classId: students.administrativeClassId }).from(students).where(eq(students.id, id)))[0];

describe("users.rule: quyết định và tình trạng học tập", () => {
  test("mỗi loại quyết định nhận tình trạng nào và đưa về tình trạng nào", () => {
    assert.deepEqual(decisionEffect("expel"), { from: ["studying", "reserved", "suspended"], to: "withdrawn" });
    assert.equal(decisionEffect("reserve").to, "reserved");
    assert.equal(decisionEffect("graduate").to, "graduated");
    assert.equal(decisionEffect("discipline", "suspension").to, "suspended");
    assert.equal(decisionEffect("discipline", "warning").to, null);
    assert.ok(changesProfile("major-change"));
    assert.ok(!changesProfile("reward"));
    assert.ok(!changesProfile("discipline", "reprimand"));
  });

  test("không bảo lưu sinh viên đã tốt nghiệp, thôi học; không công nhận tốt nghiệp sinh viên đang tạm ngừng", () => {
    assert.match(decisionBlockedReason("reserve", "graduated") ?? "", /đã tốt nghiệp nên không lập được quyết định bảo lưu/);
    assert.match(decisionBlockedReason("reserve", "withdrawn") ?? "", /đã thôi học/);
    assert.match(decisionBlockedReason("graduate", "suspended") ?? "", /đang tạm ngừng học nên không lập được quyết định công nhận tốt nghiệp/);
    assert.match(decisionBlockedReason("resume", "studying") ?? "", /đang học/);
    assert.equal(decisionBlockedReason("resume", "reserved"), null);
    assert.equal(decisionBlockedReason("reward", "graduated"), null);
    assert.ok(decisionBlockedReason("expel", "withdrawn"));
  });

  test("thu hồi chặn khi tình trạng, lớp đã đổi sau quyết định", () => {
    const decision = { kind: "reserve" as const, disciplineLevel: null, appliedAt: new Date(), targetClassId: null };
    assert.equal(revokeBlockedReason(decision, { status: "reserved", administrativeClassId: "c1" }), null);
    assert.match(revokeBlockedReason(decision, { status: "studying", administrativeClassId: "c1" }) ?? "", /Thu hồi quyết định đổi tình trạng sau trước/);
    assert.equal(revokeBlockedReason({ ...decision, appliedAt: null }, { status: "studying", administrativeClassId: "c1" }), null, "chưa có hiệu lực thì thu hồi tự do");
    const transfer = { kind: "major-change" as const, disciplineLevel: null, appliedAt: new Date(), targetClassId: "c2" };
    assert.match(revokeBlockedReason(transfer, { status: "studying", administrativeClassId: "c3" }) ?? "", /lớp khác/);
  });

  test("kỷ luật cần mức, chuyển ngành cần lớp đích; trường không dùng thì bỏ", () => {
    const base = { studentId: "01940000-0000-7000-8000-000000000001", title: "T", basis: "B", effectiveDate: "2026-11-01" };
    const discipline = DECISION_SCHEMA.safeParse({ ...base, kind: "discipline" });
    assert.ok(!discipline.success && discipline.error.issues.some((issue) => issue.path[0] === "disciplineLevel"));
    const transfer = DECISION_SCHEMA.safeParse({ ...base, kind: "major-change" });
    assert.ok(!transfer.success && transfer.error.issues.some((issue) => issue.path[0] === "targetClassName"));
    const reward = DECISION_SCHEMA.parse({ ...base, kind: "reward", disciplineLevel: "warning", targetClassName: "X" });
    assert.equal(reward.disciplineLevel, null);
    assert.equal(reward.targetClassName, null);
  });

  test("vai trò mẫu: chuyên viên lập không ký; Trưởng phòng ký được", () => {
    const officer = ROLES.find((role) => role.id === "academic-officer")!;
    const head = ROLES.find((role) => role.id === "academic-head")!;
    assert.ok(officer.permissions.includes("decisions.manage") && !officer.permissions.includes("decisions.sign"));
    assert.ok(head.permissions.includes("decisions.sign"));
  });
});

describe("users.decision: lập, ký, hiệu lực, thu hồi trên DB", () => {
  const PREFIX = `TEST-DEC-${Date.now()}`;
  let maker: DecisionActor;
  let signer: DecisionActor;
  let mathMajorId = "";
  let physicsMajorId = "";
  const committedStudents: string[] = [];
  const committedClasses: string[] = [];

  before(async () => {
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn"));
    const [lecturer] = await db.select({ id: user.id }).from(user).where(eq(user.email, "hanhpt@hcmue.edu.vn"));
    maker = { id: lecturer.id, name: "Chuyên viên thử", roleName: "Chuyên viên Phòng Đào tạo", faculty: null };
    signer = { id: admin.id, name: "Trần Minh Khoa", roleName: "Trưởng phòng Đào tạo", faculty: null };
    [{ id: mathMajorId }] = await db.select({ id: majors.id }).from(majors).where(eq(majors.code, "101"));
    [{ id: physicsMajorId }] = await db.select({ id: majors.id }).from(majors).where(eq(majors.code, "102"));
  });

  after(async () => {
    if (committedStudents.length > 0) {
      const decisionIds = (await db.select({ id: studentDecisions.id }).from(studentDecisions).where(inArray(studentDecisions.studentId, committedStudents))).map((row) => row.id);
      if (decisionIds.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.entityId, decisionIds));
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, committedStudents));
      await db.delete(studentDecisions).where(inArray(studentDecisions.studentId, committedStudents));
      await db.delete(students).where(inArray(students.id, committedStudents));
    }
    if (committedClasses.length > 0) await db.delete(administrativeClasses).where(inArray(administrativeClasses.id, committedClasses));
    await db.$client.end();
  });

  let sequence = 0;
  async function makeStudent(tx: Transaction | typeof db, status: StudentStatus = "studying", majorId = mathMajorId) {
    sequence += 1;
    const [homeClass] = await tx.insert(administrativeClasses).values({ code: `${PREFIX}-${sequence}`, majorId, cohort: 96 }).returning();
    const [student] = await tx
      .insert(students)
      .values({ code: `${PREFIX}-${sequence}`, fullName: `Sinh viên thử quyết định ${sequence}`, gender: "male", dateOfBirth: "2008-01-01", email: `${PREFIX.toLowerCase()}-${sequence}@student.hcmue.edu.vn`, administrativeClassId: homeClass.id, status })
      .returning();
    return { student, homeClass };
  }

  test("tách nhiệm vụ: người lập không tự ký; ký xong có hiệu lực ngay, lưu tình trạng trước; có nhật ký từng bước", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const id = await createDecisionDraft(tx, maker, input(student.id, "reserve"));
      await submitDecision(tx, maker, id);
      const [pending] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id));
      assert.match(pending.number ?? "", /^\d+\/QĐ-ĐHSP$/);
      assert.match(await rejected(signDecision(tx, maker, id)), /không tự ký/);
      const outcome = await signDecision(tx, signer, id);
      assert.equal(outcome.applied, true);
      const [signed] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id));
      assert.equal(signed.status, "signed");
      assert.equal(signed.previousStatus, "studying");
      assert.ok(signed.appliedAt);
      assert.equal(signed.signedByUserId, signer.id);
      assert.equal((await statusOf(tx, student.id)).status, "reserved");
      const actions = (await tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entityId, id))).map((row) => row.action).toSorted();
      assert.deepEqual(actions, ["create", "sign", "submit"]);
      const [studentAudit] = await tx.select().from(auditLogs).where(and(eq(auditLogs.entityType, "student"), eq(auditLogs.entityId, student.id)));
      assert.equal(studentAudit.changes[0].after, "Bảo lưu");
    });
  });

  test("DB chặn người ký trùng người lập", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const id = await createDecisionDraft(tx, maker, input(student.id, "reserve"));
      const error = await tx
        .update(studentDecisions)
        .set({ signedByUserId: maker.id })
        .where(eq(studentDecisions.id, id))
        .then(() => null)
        .catch((caught: unknown) => caught);
      assert.equal(pgErrorMessage(error, USERS_CONSTRAINT_MESSAGE), USERS_CONSTRAINT_MESSAGE.student_decisions_signer_not_creator);
    });
  });

  test("buộc thôi học: sinh viên thôi học; thu hồi trả về đúng tình trạng trước đó (tạm ngừng), không về đang học", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx, "suspended");
      const id = await createDecisionDraft(tx, maker, input(student.id, "expel"));
      await submitDecision(tx, maker, id);
      await signDecision(tx, signer, id);
      assert.equal((await statusOf(tx, student.id)).status, "withdrawn");
      assert.match(await rejected(createDecisionDraft(tx, maker, input(student.id, "reserve"))), /đã thôi học/);
      await revokeDecision(tx, signer, id, "Sinh viên khiếu nại, Hội đồng xét lại");
      assert.equal((await statusOf(tx, student.id)).status, "suspended");
      const [revoked] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id));
      assert.equal(revoked.status, "revoked");
      assert.equal(revoked.revokedByUserId, signer.id);
      assert.equal(revoked.revokeReason, "Sinh viên khiếu nại, Hội đồng xét lại");
      assert.ok(revoked.revokedAt);
    });
  });

  test("ký trước ngày hiệu lực: chưa đổi tình trạng, chặn ký chồng quyết định đổi tình trạng khác", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const id = await createDecisionDraft(tx, maker, input(student.id, "reserve", { effectiveDate: day(10) }));
      await submitDecision(tx, maker, id);
      assert.equal((await signDecision(tx, signer, id)).applied, false);
      assert.equal((await statusOf(tx, student.id)).status, "studying");
      const second = await createDecisionDraft(tx, maker, input(student.id, "expel"));
      await submitDecision(tx, maker, second);
      assert.match(await rejected(signDecision(tx, signer, second)), /chưa tới ngày hiệu lực/);
      // Thu hồi khi chưa có hiệu lực: không đổi gì ở hồ sơ.
      await revokeDecision(tx, signer, id, "Sinh viên rút đơn");
      assert.equal((await statusOf(tx, student.id)).status, "studying");
    });
  });

  test("tác vụ decision-effects áp dụng quyết định tới ngày hiệu lực, chạy lại không áp dụng lần nữa", async () => {
    const { student } = await makeStudent(db);
    committedStudents.push(student.id);
    committedClasses.push(student.administrativeClassId);
    const [row] = await db
      .insert(studentDecisions)
      .values({ kind: "reserve", studentId: student.id, title: "Bảo lưu thử", basis: "Thử", effectiveDate: day(0), status: "signed", number: `${PREFIX}/QĐ`, signedAt: new Date(), signedBy: "Thử" })
      .returning({ id: studentDecisions.id });
    const first = await runDecisionEffectsJob();
    assert.ok(first.applied >= 1);
    const [applied] = await db.select().from(studentDecisions).where(eq(studentDecisions.id, row.id));
    assert.ok(applied.appliedAt);
    assert.equal(applied.previousStatus, "studying");
    const [current] = await db.select({ status: students.status }).from(students).where(eq(students.id, student.id));
    assert.equal(current.status, "reserved");
    await runDecisionEffectsJob();
    const [again] = await db.select({ appliedAt: studentDecisions.appliedAt }).from(studentDecisions).where(eq(studentDecisions.id, row.id));
    assert.equal(again.appliedAt?.getTime(), applied.appliedAt?.getTime());
  });

  test("chuyển ngành: lớp đích khác ngành, có hiệu lực thì chuyển lớp, thu hồi về lớp cũ", async () => {
    await inRollback(async (tx) => {
      const { student, homeClass } = await makeStudent(tx, "studying", physicsMajorId);
      const [target] = await tx.insert(administrativeClasses).values({ code: `${PREFIX}-math`, majorId: mathMajorId, cohort: 96 }).returning();
      assert.match(await rejected(createDecisionDraft(tx, maker, input(student.id, "major-change", { targetClassName: homeClass.code }))), /cùng ngành/);
      assert.match(await rejected(createDecisionDraft(tx, maker, input(student.id, "major-change", { targetClassName: `${PREFIX}-none` }))), /Không có lớp/);
      const id = await createDecisionDraft(tx, maker, input(student.id, "major-change", { targetClassName: target.code }));
      await submitDecision(tx, maker, id);
      await signDecision(tx, signer, id);
      assert.equal((await statusOf(tx, student.id)).classId, target.id);
      const [signed] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id));
      assert.equal(signed.previousClassId, homeClass.id);
      await revokeDecision(tx, signer, id, "Khoa không tiếp nhận");
      assert.equal((await statusOf(tx, student.id)).classId, homeClass.id);
    });
  });

  test("kỷ luật lưu mức trên quyết định; đình chỉ học tập đưa về tạm ngừng học", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const warning = await createDecisionDraft(tx, maker, input(student.id, "discipline", { disciplineLevel: "warning" }));
      const [row] = await tx.select({ level: studentDecisions.disciplineLevel }).from(studentDecisions).where(eq(studentDecisions.id, warning));
      assert.equal(row.level, "warning");
      const suspension = await createDecisionDraft(tx, maker, input(student.id, "discipline", { disciplineLevel: "suspension" }));
      await submitDecision(tx, maker, suspension);
      await signDecision(tx, signer, suspension);
      assert.equal((await statusOf(tx, student.id)).status, "suspended");
    });
  });

  test("tốt nghiệp: không lập tay; ký thì hồ sơ xét tốt nghiệp thành đã tốt nghiệp, thu hồi thì về chờ xét", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      assert.match(await rejected(createDecisionDraft(tx, maker, input(student.id, "graduate"))), /trang Xét tốt nghiệp/);
      // Như approveGraduation: dự thảo quyết định + hồ sơ "approved" trỏ tới quyết định.
      const [decision] = await tx
        .insert(studentDecisions)
        .values({ kind: "graduate", studentId: student.id, title: "Công nhận tốt nghiệp thử", basis: "Hội đồng", effectiveDate: day(0), createdByUserId: maker.id })
        .returning({ id: studentDecisions.id });
      await tx.insert(graduationRecords).values({ studentId: student.id, status: "approved", decidedAt: new Date(), decisionId: decision.id });
      await submitDecision(tx, maker, decision.id);
      await signDecision(tx, signer, decision.id);
      assert.equal((await statusOf(tx, student.id)).status, "graduated");
      const [record] = await tx.select().from(graduationRecords).where(eq(graduationRecords.studentId, student.id));
      assert.equal(record.status, "graduated");
      await revokeDecision(tx, signer, decision.id, "Phát hiện sai sót điểm");
      assert.equal((await statusOf(tx, student.id)).status, "studying");
      const [reset] = await tx.select().from(graduationRecords).where(eq(graduationRecords.studentId, student.id));
      assert.equal(reset.status, "pending");
      assert.equal(reset.decidedAt, null);
      assert.equal(reset.decisionId, null);
    });
  });

  test("ký tốt nghiệp khi hồ sơ xét tốt nghiệp chưa được công nhận thì bị chặn", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const [decision] = await tx
        .insert(studentDecisions)
        .values({ kind: "graduate", studentId: student.id, title: "Thử", basis: "Thử", effectiveDate: day(0), createdByUserId: maker.id })
        .returning({ id: studentDecisions.id });
      await submitDecision(tx, maker, decision.id);
      assert.match(await rejected(signDecision(tx, signer, decision.id)), /chưa được Hội đồng công nhận/);
    });
  });

  test("dự thảo: sửa được, trả lại về dự thảo kèm lý do và bỏ số, hủy được; đã ký thì không sửa", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const id = await createDecisionDraft(tx, maker, input(student.id, "reserve"));
      await updateDecisionDraft(tx, maker, id, input(student.id, "reserve", { title: "Bảo lưu 1 học kỳ" }));
      assert.match(await rejected(updateDecisionDraft(tx, maker, id, input(student.id, "expel"))), /Không đổi sinh viên hay loại/);
      await submitDecision(tx, maker, id);
      await returnDecision(tx, signer, id, "Thiếu xác nhận của khoa");
      const [returned] = await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id));
      assert.equal(returned.status, "draft");
      assert.equal(returned.number, null);
      assert.equal(returned.returnReason, "Thiếu xác nhận của khoa");
      assert.equal(returned.title, "Bảo lưu 1 học kỳ");
      await deleteDecisionDraft(tx, maker, id);
      assert.equal((await tx.select().from(studentDecisions).where(eq(studentDecisions.id, id))).length, 0);
      const signedId = await createDecisionDraft(tx, maker, input(student.id, "reserve"));
      await submitDecision(tx, maker, signedId);
      await signDecision(tx, signer, signedId);
      assert.match(await rejected(updateDecisionDraft(tx, maker, signedId, input(student.id, "reserve"))), /dự thảo/);
      assert.match(await rejected(deleteDecisionDraft(tx, maker, signedId)), /thu hồi/);
    });
  });

  test("phạm vi khoa: người theo khoa không lập quyết định cho sinh viên khoa khác", async () => {
    await inRollback(async (tx) => {
      const { student } = await makeStudent(tx);
      const scoped = { ...maker, faculty: "Khoa Ngữ văn" };
      assert.match(await rejected(createDecisionDraft(tx, scoped, input(student.id, "reserve"))), /khoa khác/);
    });
  });
});
