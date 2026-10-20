import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, asc, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { InputError } from "@/shared/libs/action.lib";
import { mockTermId } from "@/shared/libs/mock.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { conflictsOf } from "@/modules/course-registration/course-registration.constant";
import {
  adminDropStudent,
  creditLimitsFor,
  dropForStudent,
  expireWaitlists,
  joinWaitlistForStudent,
  lockRegistration,
  promoteWaitlist,
  registerForStudent,
  registrationStudentOf,
  scheduleProblemOf,
  swapForStudent,
  switchTermFlag,
  termFactsOf,
  type RegistrationRules,
} from "@/modules/course-registration/course-registration.lib";
import { addsSeats, applicablePeriod, corequisiteDependents, creditLimitsOf, dropCreditProblem, inProgressCodesFor, lastAttemptGrades } from "@/modules/course-registration/course-registration.rule";
import { classSections, enrollments, labGroups, registrationEvents, registrationPeriods, terms, waitlistEntries } from "@/modules/course-registration/course-registration.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { students } from "@/modules/users/users.schema";
import { campuses, rooms } from "@/modules/facilities/facilities.schema";
import { academicWarnings } from "@/modules/grades/grades.schema";
import { holidaySessions, planClassSessions } from "@/modules/schedule/schedule.rule";
import { TUITION_CONSTRAINT_MESSAGE } from "@/modules/tuition/tuition.constant";
import { INVOICE_PAID_SQL, INVOICE_TOTAL_SQL, syncTermInvoice } from "@/modules/tuition/tuition.lib";
import { invoiceLines, payments, tuitionInvoices, tuitionRefunds } from "@/modules/tuition/tuition.schema";
import { CURRENT_STUDENT_ID } from "@/modules/users/users.mock";

after(() => db.$client.end());

const RULES: RegistrationRules = { credits: { minPerTerm: 14, maxPerTerm: 25, maxSummer: 8, maxWhenWarned: 14 } };
const TARGET = mockTermId("hk2-2026");
const CURRENT = mockTermId("hk1-2026");

async function rolledBack(work: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await work(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) throw error;
    });
}

// Chạy trong savepoint để lỗi nghiệp vụ (ném InputError) không làm hỏng transaction của test.
async function expectInputError(tx: Transaction, work: (savepoint: Transaction) => Promise<unknown>, pattern: RegExp) {
  const error = await tx.transaction((savepoint) => work(savepoint)).then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof InputError, `cần InputError, nhận ${String(error)}`);
  assert.match(error.message, pattern);
}

async function sectionId(tx: Transaction, code: string, termId = TARGET) {
  const [row] = await tx.select({ id: classSections.id }).from(classSections).where(and(eq(classSections.code, code), eq(classSections.termId, termId)));
  assert.ok(row, `thiếu lớp ${code}`);
  return row.id;
}

async function registeredCodes(tx: Transaction, studentId = CURRENT_STUDENT_ID) {
  const rows = await tx
    .select({ code: classSections.code })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.termId, TARGET), eq(enrollments.status, "enrolled")));
  return rows.map((row) => row.code).toSorted();
}

const now = () => new Date();

const periodOf = (name: string, opens: string, closes: string, cohorts = [50]) => ({ name, cohorts, opensAt: opens, closesAt: closes });

const roomCandidate = (room: string, capacity: number, day = 8) => ({ id: null, termId: CURRENT, lecturerId: null, capacity, meetings: [{ dayOfWeek: day, startPeriod: 10, endPeriod: 12, room }], labGroups: [] });

describe("registration: đợt áp dụng, hạn mức (hàm thuần)", () => {
  test("đang mở > sắp mở gần nhất > vừa đóng; đợt điều chỉnh mở thì lấy đợt điều chỉnh", () => {
    const periods = [periodOf("Đợt 1", "2026-08-01T00:00:00Z", "2026-08-10T00:00:00Z"), periodOf("Điều chỉnh", "2026-09-07T00:00:00Z", "2026-09-13T00:00:00Z", [48, 50])];
    assert.equal(applicablePeriod(periods, 50, new Date("2026-09-08T00:00:00Z"))?.name, "Điều chỉnh");
    assert.equal(applicablePeriod(periods, 50, new Date("2026-08-05T00:00:00Z"))?.name, "Đợt 1");
    assert.equal(applicablePeriod(periods, 50, new Date("2026-08-20T00:00:00Z"))?.name, "Điều chỉnh");
    assert.equal(applicablePeriod(periods, 50, new Date("2026-10-01T00:00:00Z"))?.name, "Điều chỉnh");
    assert.equal(applicablePeriod(periods, 51, new Date("2026-09-08T00:00:00Z")), null);
  });

  test("học kỳ hè dùng maxSummer, không bắt tối thiểu; cảnh báo học vụ; hạn mức của đợt giới hạn thêm; sắp hoàn thành chương trình", () => {
    const rules = RULES.credits;
    assert.deepEqual(creditLimitsOf({ rules, semester: 1, warningLevel: 0 }), { min: 14, max: 25, note: undefined, minNote: undefined });
    const summer = creditLimitsOf({ rules, semester: 3, warningLevel: 0 });
    assert.equal(summer.min, 0);
    assert.equal(summer.max, 8);
    assert.ok(summer.minNote);
    assert.equal(creditLimitsOf({ rules, semester: 2, warningLevel: 1 }).max, 14);
    const capped = creditLimitsOf({ rules, semester: 2, warningLevel: 0, period: { minCredits: null, maxCredits: 20 } });
    assert.equal(capped.max, 20);
    assert.match(capped.note!, /Đợt/);
    // Đợt không nới quá quy chế.
    assert.equal(creditLimitsOf({ rules, semester: 2, warningLevel: 0, period: { minCredits: 10, maxCredits: 30 } }).max, 25);
    assert.equal(creditLimitsOf({ rules, semester: 2, warningLevel: 0, period: { minCredits: 10, maxCredits: 30 } }).min, 14);
    const lastYear = creditLimitsOf({ rules, semester: 2, warningLevel: 0, remainingCredits: 6 });
    assert.equal(lastYear.min, 6);
    assert.ok(lastYear.minNote);
  });

  test("hủy lớp: dưới tối thiểu thì chặn; song hành bắt buộc thì chặn", () => {
    const limits = creditLimitsOf({ rules: RULES.credits, semester: 2, warningLevel: 0 });
    assert.ok(dropCreditProblem(13, limits));
    assert.equal(dropCreditProblem(14, limits), null);
    assert.deepEqual(corequisiteDependents("COMP1120", ["COMP1121", "MATH2001"], { COMP1121: ["COMP1120"] }, () => false), ["COMP1121"]);
    assert.deepEqual(corequisiteDependents("COMP1120", ["COMP1121"], { COMP1121: ["COMP1120"] }, () => true), []);
  });

  test("điểm lần học cuối: học lại đạt thì đạt, học cải thiện điểm thấp hơn thì lấy điểm thấp hơn; đang học không tính", () => {
    const grades = lastAttemptGrades([
      { isInProgress: false, courses: [{ courseCode: "A", letter: "F" }, { courseCode: "B", letter: "B+" }] },
      { isInProgress: false, courses: [{ courseCode: "A", letter: "C" }, { courseCode: "B", letter: "C" }] },
      { isInProgress: true, courses: [{ courseCode: "C", letter: null }] },
    ]);
    assert.deepEqual(grades, { A: "C", B: "C" });
    assert.deepEqual(inProgressCodesFor("t2", "t1", ["X", "X"]), ["X"]);
    assert.deepEqual(inProgressCodesFor("t1", "t1", ["X"]), []);
  });

  test("trùng giờ giảng viên tính cả buổi nhóm thực hành, trùng phòng mọi lớp", () => {
    const base = { status: "open" as const, lecturerId: "gv", meetings: [{ dayOfWeek: 2, startPeriod: 1, endPeriod: 3, room: "A" }], labGroups: [] };
    const other = { id: "b", code: "B.01", status: "open" as const, lecturerId: "gv", meetings: [], labGroups: [{ id: "l", code: "B.01.TH1", capacity: 20, enrolled: 0, meeting: { dayOfWeek: 2, startPeriod: 2, endPeriod: 4, room: "C" } }] };
    assert.deepEqual(conflictsOf({ ...base, id: "a" }, [other]).map((conflict) => conflict.kind), ["lecturer"]);
    assert.deepEqual(conflictsOf({ ...base, id: "a", lecturerId: null, meetings: [{ ...base.meetings[0], room: "C" }] }, [other]).map((conflict) => conflict.kind), ["room"]);
  });

  test("buổi học rơi vào ngày nghỉ lễ bị trừ và được đánh dấu cần dạy bù", () => {
    const section = { id: "lop", startDate: "2027-04-26", endDate: "2027-05-09", meetings: [{ dayOfWeek: 6, startPeriod: 1, endPeriod: 3, roomId: "r" }], labGroups: [] };
    const holidays = [{ title: "Nghỉ lễ 30/4 và 1/5", startDate: "2027-04-30", endDate: "2027-05-03" }];
    assert.deepEqual(planClassSessions(section).map((plan) => plan.date), ["2027-04-30", "2027-05-07"]);
    assert.deepEqual(planClassSessions(section, holidays).map((plan) => plan.date), ["2027-05-07"]);
    assert.deepEqual(holidaySessions(section, holidays).map((plan) => [plan.date, plan.holiday]), [["2027-04-30", "Nghỉ lễ 30/4 và 1/5"]]);
  });
});

describe("registration: đăng ký, hủy, đổi lớp trên DB", () => {
  test("đăng ký cập nhật hóa đơn tạm tính; vượt hạn mức thì chặn; hủy dưới tối thiểu, hủy học phần song hành bắt buộc thì chặn", async () => {
    await rolledBack(async (tx) => {
      const before = await registeredCodes(tx);
      assert.ok(before.includes("COMP1120.01") && before.includes("COMP1121.01"));
      const math = await sectionId(tx, "MATH2001.01");
      await expectInputError(tx, (sp) => registerForStudent(sp, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionIds: [math], labChoices: {}, rules: { credits: { ...RULES.credits, maxPerTerm: 18 } }, now: now() }), /Vượt hạn mức 18/);
      await registerForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionIds: [math], labChoices: {}, rules: RULES, now: now() });
      assert.ok((await registeredCodes(tx)).includes("MATH2001.01"));
      const [line] = await tx
        .select({ quantity: invoiceLines.quantity, finalizedAt: tuitionInvoices.finalizedAt })
        .from(invoiceLines)
        .innerJoin(tuitionInvoices, eq(tuitionInvoices.id, invoiceLines.invoiceId))
        .where(and(eq(tuitionInvoices.studentId, CURRENT_STUDENT_ID), eq(tuitionInvoices.termId, TARGET), eq(invoiceLines.kind, "tuition")));
      assert.equal(line.finalizedAt, null);
      assert.equal(line.quantity, 19);

      const security = await sectionId(tx, "COMP1120.01");
      await expectInputError(tx, (sp) => dropForStudent(sp, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: security, rules: RULES, now: now() }), /song hành/);
      // 19 tín chỉ, hủy 3 còn 16: được; hủy thêm 3 còn 13 dưới 14: chặn.
      await dropForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: math, rules: RULES, now: now() });
      const testing = await sectionId(tx, "COMP1150.01");
      await expectInputError(tx, (sp) => dropForStudent(sp, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: testing, rules: RULES, now: now() }), /dưới mức tối thiểu 14/);
    });
  });

  test("mức cảnh báo áp hạn mức là cảnh báo đã gửi của học kỳ chính gần nhất có cảnh báo", async () => {
    await rolledBack(async (tx) => {
      const [student, term] = await Promise.all([registrationStudentOf(tx, CURRENT_STUDENT_ID), termFactsOf(tx, TARGET)]);
      assert.equal((await creditLimitsFor(tx, student!, term!, RULES, now())).limits.max, 25);
      await tx.insert(academicWarnings).values({ studentId: CURRENT_STUDENT_ID, termId: CURRENT, level: 1, termGpa4: 1.5, cpa4: 2.5, failedCredits: 0, reasons: ["Thử"], status: "new" });
      // Chưa gửi thì chưa áp.
      assert.equal((await creditLimitsFor(tx, student!, term!, RULES, now())).limits.max, 25);
      await tx.update(academicWarnings).set({ status: "notified" }).where(and(eq(academicWarnings.studentId, CURRENT_STUDENT_ID), eq(academicWarnings.termId, CURRENT)));
      const warned = await creditLimitsFor(tx, student!, term!, RULES, now());
      assert.equal(warned.warningLevel, 1);
      assert.equal(warned.limits.max, 14);
    });
  });

  test("đổi nhóm thực hành một bước; đổi sang lớp đầy thì giữ nguyên chỗ cũ", async () => {
    await rolledBack(async (tx) => {
      const ml = await sectionId(tx, "COMP1100.02");
      const labs = await tx.select({ id: labGroups.id, code: labGroups.code }).from(labGroups).where(eq(labGroups.classSectionId, ml)).orderBy(asc(labGroups.code));
      const [own] = await tx.select({ labGroupId: enrollments.labGroupId }).from(enrollments).where(and(eq(enrollments.studentId, CURRENT_STUDENT_ID), eq(enrollments.classSectionId, ml), eq(enrollments.status, "enrolled")));
      const target = labs.find((lab) => lab.id !== own.labGroupId && lab.code.endsWith("TH2"))!;
      await swapForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, fromSectionId: ml, toSectionId: ml, labGroupId: target.id, rules: RULES, now: now() });
      const [swapped] = await tx.select({ labGroupId: enrollments.labGroupId }).from(enrollments).where(and(eq(enrollments.studentId, CURRENT_STUDENT_ID), eq(enrollments.classSectionId, ml), eq(enrollments.status, "enrolled")));
      assert.equal(swapped.labGroupId, target.id);
      const [event] = await tx.select({ kind: registrationEvents.kind }).from(registrationEvents).where(and(eq(registrationEvents.studentId, CURRENT_STUDENT_ID), eq(registrationEvents.classSectionId, ml), eq(registrationEvents.kind, "swap")));
      assert.ok(event);

      const full = await sectionId(tx, "COMP1100.01");
      const [fullLab] = await tx.select({ id: labGroups.id }).from(labGroups).where(eq(labGroups.classSectionId, full)).limit(1);
      await expectInputError(tx, (sp) => swapForStudent(sp, { studentId: CURRENT_STUDENT_ID, termId: TARGET, fromSectionId: ml, toSectionId: full, labGroupId: fullLab.id, rules: RULES, now: now() }), /đủ/);
      assert.ok((await registeredCodes(tx)).includes("COMP1100.02"));
    });
  });

  test("danh sách chờ: chỉ nhận khi lớp hết chỗ; có chỗ thì tự xếp người đầu danh sách trong cùng transaction", async () => {
    await rolledBack(async (tx) => {
      const math = await sectionId(tx, "MATH2001.01");
      await expectInputError(tx, (sp) => joinWaitlistForStudent(sp, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: math, rules: RULES, now: now() }), /còn chỗ/);
      const [section] = await tx.select({ enrolled: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, math));
      await tx.update(classSections).set({ capacity: section.enrolled }).where(eq(classSections.id, math));
      const position = await joinWaitlistForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: math, rules: RULES, now: now() });
      assert.equal(position, 1);
      const [other] = await tx.select({ studentId: enrollments.studentId }).from(enrollments).where(and(eq(enrollments.classSectionId, math), eq(enrollments.status, "enrolled"))).limit(1);
      const promoted = await adminDropStudent(tx, { studentId: other.studentId, sectionId: math, reason: "Thử", actor: { userId: null, label: "Thử", channel: "Phòng Đào tạo" }, rules: RULES, now: now() });
      assert.deepEqual(promoted, [CURRENT_STUDENT_ID]);
      assert.ok((await registeredCodes(tx)).includes("MATH2001.01"));
      const [entry] = await tx.select({ status: waitlistEntries.status }).from(waitlistEntries).where(and(eq(waitlistEntries.studentId, CURRENT_STUDENT_ID), eq(waitlistEntries.classSectionId, math)));
      assert.equal(entry.status, "promoted");
      const [event] = await tx.select({ kind: registrationEvents.kind }).from(registrationEvents).where(and(eq(registrationEvents.studentId, CURRENT_STUDENT_ID), eq(registrationEvents.classSectionId, math), eq(registrationEvents.kind, "waitlist-promoted")));
      assert.ok(event);
    });
  });

  test("danh sách chờ: tăng sĩ số một nhóm thực hành (lớp còn chỗ, mọi nhóm đầy) cũng xếp người chờ", async () => {
    assert.equal(addsSeats({ capacity: 40, labGroups: [{ code: "A.TH1", capacity: 20 }] }, { capacity: 40, labGroups: [{ code: "A.TH1", capacity: 21 }] }), true);
    assert.equal(addsSeats({ capacity: 40, labGroups: [{ code: "A.TH1", capacity: 20 }] }, { capacity: 40, labGroups: [{ code: "A.TH1", capacity: 20 }, { code: "A.TH2", capacity: 10 }] }), true);
    assert.equal(addsSeats({ capacity: 40, labGroups: [{ code: "A.TH1", capacity: 20 }] }, { capacity: 40, labGroups: [{ code: "A.TH1", capacity: 18 }] }), false);
    await rolledBack(async (tx) => {
      const lab = await sectionId(tx, "COMP1100.02");
      await tx.update(enrollments).set({ status: "dropped", droppedAt: new Date() }).where(and(eq(enrollments.studentId, CURRENT_STUDENT_ID), eq(enrollments.classSectionId, lab), eq(enrollments.status, "enrolled")));
      await tx.update(labGroups).set({ capacity: sql`${labGroups.enrolledCount}` }).where(eq(labGroups.classSectionId, lab));
      const position = await joinWaitlistForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: lab, rules: RULES, now: now() });
      assert.equal(position, 1);
      assert.deepEqual(await promoteWaitlist(tx, lab, RULES, now()), []);
      await tx.update(labGroups).set({ capacity: sql`${labGroups.capacity} + 1` }).where(and(eq(labGroups.classSectionId, lab), eq(labGroups.code, "COMP1100.02.TH1")));
      assert.deepEqual(await promoteWaitlist(tx, lab, RULES, now()), [CURRENT_STUDENT_ID]);
      assert.ok((await registeredCodes(tx)).includes("COMP1100.02"));
    });
  });

  test("danh sách chờ hết hạn khi khóa hết mọi đợt đăng ký: không còn tự xếp, báo sinh viên, chạy lại không trùng", async () => {
    await rolledBack(async (tx) => {
      const math = await sectionId(tx, "MATH2001.01");
      const [section] = await tx.select({ enrolled: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, math));
      await tx.update(classSections).set({ capacity: section.enrolled }).where(eq(classSections.id, math));
      await joinWaitlistForStudent(tx, { studentId: CURRENT_STUDENT_ID, termId: TARGET, sectionId: math, rules: RULES, now: now() });
      // Đợt của khóa 50 còn mở hoặc đợt điều chỉnh sắp mở: chưa hết hạn.
      assert.equal((await expireWaitlists(tx, now(), TARGET)).expired, 0);
      const closedAt = new Date(Date.now() - 60_000);
      await tx
        .update(registrationPeriods)
        .set({ opensAt: new Date(closedAt.getTime() - 3_600_000), closesAt: closedAt })
        .where(and(eq(registrationPeriods.termId, TARGET), sql`50 = ANY(${registrationPeriods.cohorts})`));
      // Ngoài đợt: lớp có chỗ cũng không xếp người chờ.
      await tx.update(classSections).set({ capacity: section.enrolled + 1 }).where(eq(classSections.id, math));
      assert.deepEqual(await promoteWaitlist(tx, math, RULES, now()), []);
      const result = await expireWaitlists(tx, now(), TARGET);
      assert.ok(result.expired >= 1);
      const [entry] = await tx.select({ status: waitlistEntries.status, resolvedAt: waitlistEntries.resolvedAt }).from(waitlistEntries).where(and(eq(waitlistEntries.studentId, CURRENT_STUDENT_ID), eq(waitlistEntries.classSectionId, math)));
      assert.equal(entry.status, "expired");
      assert.ok(entry.resolvedAt);
      const [event] = await tx.select({ kind: registrationEvents.kind }).from(registrationEvents).where(and(eq(registrationEvents.studentId, CURRENT_STUDENT_ID), eq(registrationEvents.classSectionId, math), eq(registrationEvents.kind, "waitlist-expired")));
      assert.ok(event);
      const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, CURRENT_STUDENT_ID));
      const notes = await tx.select({ title: notifications.title }).from(notifications).where(and(eq(notifications.recipientUserId, student.userId!), sql`${notifications.title} LIKE '%MATH2001.01%hết hạn'`));
      assert.equal(notes.length, 1);
      assert.deepEqual(await expireWaitlists(tx, now(), TARGET), { expired: 0, students: 0 });
    });
  });

  test("hai thao tác đăng ký của cùng sinh viên trong học kỳ chạy nối tiếp (khóa theo sinh viên + học kỳ)", async () => {
    let released = 0;
    const first = db
      .transaction(async (tx) => {
        await lockRegistration(tx, CURRENT_STUDENT_ID, TARGET);
        await new Promise((resolve) => setTimeout(resolve, 400));
        released = Date.now();
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
    await new Promise((resolve) => setTimeout(resolve, 100));
    let acquired = 0;
    const second = db
      .transaction(async (tx) => {
        await lockRegistration(tx, CURRENT_STUDENT_ID, TARGET);
        acquired = Date.now();
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
    await Promise.all([first, second]);
    assert.ok(acquired >= released && released > 0);
  });
});

describe("registration: học phí theo đăng ký", () => {
  test("hóa đơn đã chốt: thay đổi đăng ký thêm dòng điều chỉnh; nộp thừa thì cần hoàn, không hoàn vượt số thừa", async () => {
    await rolledBack(async (tx) => {
      const [invoice] = await tx.select({ id: tuitionInvoices.id }).from(tuitionInvoices).where(and(eq(tuitionInvoices.studentId, CURRENT_STUDENT_ID), eq(tuitionInvoices.termId, TARGET)));
      const [{ total }] = await tx.select({ total: INVOICE_TOTAL_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      await tx.insert(payments).values({ invoiceId: invoice.id, paidAt: new Date(), amount: total, method: "Thử", reference: `TEST-${invoice.id}`, source: "manual", recordedByLabel: "Thử" });
      await tx.update(tuitionInvoices).set({ finalizedAt: new Date(), finalizedByLabel: "Thử" }).where(eq(tuitionInvoices.id, invoice.id));
      const testing = await sectionId(tx, "COMP1150.01");
      await tx.update(enrollments).set({ status: "dropped", droppedAt: new Date() }).where(and(eq(enrollments.studentId, CURRENT_STUDENT_ID), eq(enrollments.classSectionId, testing)));
      const sync = await syncTermInvoice(tx, CURRENT_STUDENT_ID, TARGET, "thử");
      assert.equal(sync.change, "adjusted");
      const [adjustment] = await tx.select().from(invoiceLines).where(and(eq(invoiceLines.invoiceId, invoice.id), eq(invoiceLines.kind, "adjustment")));
      assert.equal(adjustment.quantity, 3);
      assert.ok(adjustment.unitPrice < 0);
      // Đồng bộ lại không thêm điều chỉnh trùng.
      assert.equal((await syncTermInvoice(tx, CURRENT_STUDENT_ID, TARGET)).change, "unchanged");
      const [adjusted] = await tx.select({ total: INVOICE_TOTAL_SQL, paid: INVOICE_PAID_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      const overpaid = adjusted.paid - adjusted.total;
      assert.equal(overpaid, -adjustment.unitPrice * 3);
      const tooMuch = await tx
        .transaction((sp) => sp.insert(tuitionRefunds).values({ invoiceId: invoice.id, amount: overpaid + 1000, refundedAt: new Date(), method: "Thử", reference: "R1", recordedByLabel: "Thử" }))
        .then(() => null)
        .catch((caught: unknown) => caught);
      assert.equal(pgErrorMessage(tooMuch, TUITION_CONSTRAINT_MESSAGE), TUITION_CONSTRAINT_MESSAGE.tuition_refunds_within_overpaid);
      await tx.insert(tuitionRefunds).values({ invoiceId: invoice.id, amount: overpaid, refundedAt: new Date(), method: "Thử", reference: "R2", recordedByLabel: "Thử" });
      const [settled] = await tx.select({ total: INVOICE_TOTAL_SQL, paid: INVOICE_PAID_SQL }).from(tuitionInvoices).where(eq(tuitionInvoices.id, invoice.id));
      assert.equal(settled.paid, settled.total);
    });
  });
});

describe("registration: học kỳ, lớp học phần", () => {
  test("đặt học kỳ hiện tại, học kỳ nhận đăng ký: mỗi loại một học kỳ, đặt lại cùng học kỳ thì báo", async () => {
    await rolledBack(async (tx) => {
      const { previous } = await switchTermFlag(tx, TARGET, "current");
      assert.equal(previous?.id, CURRENT);
      const current = await tx.select({ id: terms.id }).from(terms).where(eq(terms.isCurrent, true));
      assert.deepEqual(current.map((row) => row.id), [TARGET]);
      await expectInputError(tx, (sp) => switchTermFlag(sp, TARGET, "current"), /đã là học kỳ hiện tại/);
      await switchTermFlag(tx, CURRENT, "registration-target");
      const [target] = await tx.select({ id: terms.id }).from(terms).where(eq(terms.isRegistrationTarget, true));
      assert.equal(target.id, CURRENT);
    });
  });

  test("lưu lớp: chặn phòng bảo trì, phòng thiếu chỗ, trùng phòng với lớp khoa khác trong học kỳ", async () => {
    await rolledBack(async (tx) => {
      const roomRows = await tx.select({ id: rooms.id, code: rooms.code, capacity: rooms.capacity, status: rooms.status, note: rooms.note, campus: campuses.name }).from(rooms).innerJoin(campuses, eq(campuses.id, rooms.campusId));
      assert.match((await scheduleProblemOf(tx, roomCandidate("B.408", 30), roomRows))!.message, /bảo trì/);
      assert.match((await scheduleProblemOf(tx, roomCandidate("C.301 (Phòng máy)", 50), roomRows))!.message, /chỉ có 40 chỗ/);
      assert.equal(await scheduleProblemOf(tx, roomCandidate("A.201", 40), roomRows), null);
      // MATH1011.01 (Khoa Toán - Tin học) học A.201 thứ 2 tiết 1-3: lớp khoa khác cùng phòng, cùng giờ bị chặn.
      const clash = await scheduleProblemOf(tx, { ...roomCandidate("A.201", 40), meetings: [{ dayOfWeek: 2, startPeriod: 2, endPeriod: 3, room: "A.201" }] }, roomRows);
      assert.match(clash!.message, /Trùng phòng A\.201 với MATH1011\.01/);
    });
  });
});
