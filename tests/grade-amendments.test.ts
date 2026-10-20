import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { dayjs, schoolToday } from "@/shared/libs/date.lib";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties, majors } from "@/modules/curriculum/curriculum.schema";
import { examDeferrals } from "@/modules/exams/exams.schema";
import { GRADES_CONSTRAINT_MESSAGE } from "@/modules/grades/grades.constant";
import { convertOverdueIncompletes, decideGradeAmendment, proposeGradeAmendment } from "@/modules/grades/grade-amendments.lib";
import { GradeActionError, loadTranscripts } from "@/modules/grades/grades.lib";
import { GRADE_REQUEST_HANDLERS, type GradeApprovedRequest } from "@/modules/grades/grades.request-effects";
import {
  buildTranscript,
  computeStanding,
  GRADE_AMENDMENT_DECIDE_SCHEMA,
  gradeChangeTarget,
  latestAttempts,
  latestGrades,
  letterOf,
  overdueIncompletes,
  resultText,
  standingRulesOf,
  withdrawBlockedReason,
  withdrawDeadline,
} from "@/modules/grades/grades.rule";
import { courseResults, gradeAmendments, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { TranscriptCourseInput } from "@/modules/grades/grades.type";
import { notifications } from "@/modules/notifications/notifications.schema";
import { REQUEST_APPROVED_HANDLERS } from "@/modules/requests/requests.lib";
import { academicRequests } from "@/modules/requests/requests.schema";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";
import { regulations } from "@/modules/settings/settings.schema";
import { administrativeClasses, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const SCALE = REGULATION_RULES.grading.scale;
const RULES = standingRulesOf(REGULATION_RULES);

const scored = (code: string, credits: number, score10: number): TranscriptCourseInput => ({ courseCode: code, courseName: code, credits, score10, ...letterOf(score10, SCALE) });
const marked = (code: string, credits: number, letter: "W" | "I" | "M"): TranscriptCourseInput => ({ courseCode: code, courseName: code, credits, score10: null, letter, point4: null });
const term = (termId: string, courseList: TranscriptCourseInput[]) => ({ termId, termName: termId, isInProgress: false, courses: courseList });

describe("grades: ký hiệu W, I, M", () => {
  test("W, I không tính GPA, CPA, tín chỉ tích lũy và không thay lần học trước đã có điểm", () => {
    const transcript = buildTranscript([term("t1", [scored("A", 3, 7), scored("B", 2, 3)]), term("t2", [marked("A", 3, "W"), marked("B", 2, "I"), scored("C", 3, 8)])]);
    const [first, second] = transcript;
    assert.equal(first.courses.some((course) => course.replaced), false, "W, I không thay lần học trước");
    assert.equal(second.gpa4, 3.5, "GPA học kỳ chỉ tính học phần có điểm");
    assert.equal(second.attemptedCredits, 5, "W không tính khối lượng học kỳ");
    assert.equal(second.earnedCredits, 3);
    const standing = computeStanding("sv", transcript, RULES);
    assert.equal(standing.earnedCredits, 6, "A (lần đầu đạt) và C");
    assert.equal(standing.failedCredits, 2, "B vẫn nợ: lần I không phải kết quả");
    assert.deepEqual(latestGrades(transcript), { A: "B", B: "F", C: "B+" });
    assert.equal(latestAttempts(transcript.flatMap((entry) => entry.courses)).get("A")?.letter, "B");
  });

  test("M tính tín chỉ tích lũy, không tính CPA, thay lần học trượt trước đó", () => {
    const transcript = buildTranscript([term("t1", [scored("A", 3, 3), scored("B", 2, 9)]), term("t2", [marked("A", 3, "M")])]);
    assert.equal(transcript[0].courses[0].replaced, true, "M thay lần F");
    const standing = computeStanding("sv", transcript, RULES);
    assert.equal(standing.earnedCredits, 5);
    assert.equal(standing.failedCredits, 0);
    assert.equal(standing.cpa4, 4, "CPA chỉ còn học phần B");
    assert.equal(transcript[1].cpa4, 4);
    assert.equal(latestGrades(transcript).A, "M");
    const onlyExempt = computeStanding("sv", buildTranscript([term("t1", [marked("A", 3, "M")])]), RULES);
    assert.equal(onlyExempt.cpa4, null, "chỉ có M thì chưa xếp loại");
    assert.equal(onlyExempt.earnedCredits, 3);
  });

  test("ghi kết quả dạng chữ cho lịch sử sửa điểm", () => {
    assert.equal(resultText({ score10: 7.5, letter: "B" }), "7,5 (B)");
    assert.match(resultText({ score10: null, letter: "I" }), /^I \(/);
    assert.equal(resultText(null), "Chưa có");
  });
});

describe("grades: hạn rút học phần, điểm I quá hạn, đơn sửa điểm", () => {
  test("rút học phần trong số tuần đầu học kỳ theo quy chế, chưa công bố điểm", () => {
    assert.equal(withdrawDeadline("2026-09-07", 8), "2026-11-01");
    const termDates = { termStart: "2026-09-07", termEnd: "2027-01-16", sheetStatus: null };
    assert.equal(withdrawBlockedReason(termDates, "2026-11-01", 8), null);
    assert.match(withdrawBlockedReason(termDates, "2026-11-02", 8) ?? "", /quá hạn rút học phần.*8 tuần.*01\/11\/2026/);
    assert.match(withdrawBlockedReason({ ...termDates, sheetStatus: "published" }, "2026-10-01", 8) ?? "", /đã công bố điểm/);
    assert.match(withdrawBlockedReason(termDates, "2027-02-01", 30) ?? "", /đã kết thúc/);
  });

  test("điểm I chuyển F khi học kỳ thứ N sau học kỳ nhận I đã kết thúc", () => {
    const allTerms = [
      { id: "b", startDate: "2026-02-01", endDate: "2026-06-01" },
      { id: "a", startDate: "2025-09-01", endDate: "2026-01-15" },
      { id: "c", startDate: "2026-09-01", endDate: "2027-01-15" },
    ];
    const results = [{ id: "r1", termId: "a" }, { id: "r2", termId: "b" }, { id: "r3", termId: "zz" }];
    assert.deepEqual(overdueIncompletes(results, allTerms, 1, "2026-06-02").map((row) => row.id), ["r1"]);
    assert.deepEqual(overdueIncompletes(results, allTerms, 2, "2026-06-02").map((row) => row.id), []);
    assert.deepEqual(overdueIncompletes(results, allTerms, 1, "2027-02-01").map((row) => row.id), ["r1", "r2"]);
  });

  test("đọc sinh viên, cột điểm, điểm mới từ chi tiết đơn sửa điểm", () => {
    const target = gradeChangeTarget([
      { label: "Sinh viên", value: "Nguyễn Văn A, 50.01.104.009" },
      { label: "Cột điểm", value: "Cuối kỳ" },
      { label: "Điểm cũ", value: "6,00" },
      { label: "Điểm mới", value: "7,50" },
    ]);
    assert.deepEqual(target, { studentCode: "5001104009", componentLabel: "Cuối kỳ", newScore: 7.5 });
    assert.equal(gradeChangeTarget([{ label: "Cột điểm", value: "Cuối kỳ" }]), null);
  });

  test("từ chối đề nghị sửa điểm phải ghi lý do", () => {
    const parsed = parseInput(GRADE_AMENDMENT_DECIDE_SCHEMA, { id: "019a0000-0000-7000-8000-000000000000", decision: "rejected", note: " " });
    assert.ok(!parsed.ok && parsed.fieldErrors?.note);
  });

  test("module đơn từ dùng đúng handler kết quả đơn của module điểm", () => {
    for (const kind of ["regrade", "grade-change", "withdraw", "exam-postpone", "credit-transfer"] as const) {
      assert.equal(REQUEST_APPROVED_HANDLERS[kind], GRADE_REQUEST_HANDLERS[kind]);
    }
  });
});

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

async function messageOf(tx: Transaction, run: (inner: Transaction) => Promise<unknown>) {
  const error = await tx
    .transaction(async (inner) => {
      await run(inner);
    })
    .then(() => null)
    .catch((caught: unknown) => caught);
  assert.ok(error, "lệnh phải bị chặn");
  if (error instanceof GradeActionError) return error.message;
  return pgErrorMessage(error, GRADES_CONSTRAINT_MESSAGE);
}

async function accounts(tx: Transaction) {
  const rows = await tx.select({ id: user.id, username: user.username }).from(user).where(sql`${user.username} IN ('gv104011', 'cb0021')`);
  const lecturer = rows.find((row) => row.username === "gv104011")!;
  const admin = rows.find((row) => row.username === "cb0021")!;
  return {
    lecturer: { userId: lecturer.id, name: "ThS. Phạm Thùy Hạnh", role: "Giảng viên" },
    admin: { userId: admin.id, name: "Trần Minh Khoa", role: "Phòng Đào tạo" },
  };
}

// Lớp kiểm thử ở học kỳ xa (2032), hai sinh viên, bảng điểm hai cột; publish: chốt, duyệt, công bố như quy trình thật.
async function makeClass(tx: Transaction, options: { publish?: boolean; publishedAt?: Date; deferFirst?: boolean } = {}) {
  const [course] = await tx.select().from(courses).where(eq(courses.code, "COMP1070"));
  const [major] = await tx.select().from(majors).limit(1);
  const [faculty] = await tx.select().from(faculties).limit(1);
  const [first] = await tx
    .insert(terms)
    .values({ code: "TEST-GA-1", name: "Học kỳ kiểm thử sửa điểm 1", shortName: "KT1", academicYear: 2032, semester: 1, startDate: "2032-01-05", endDate: "2032-05-01" })
    .returning();
  const [second] = await tx
    .insert(terms)
    .values({ code: "TEST-GA-2", name: "Học kỳ kiểm thử sửa điểm 2", shortName: "KT2", academicYear: 2032, semester: 2, startDate: "2032-06-01", endDate: "2032-08-30" })
    .returning();
  const [homeClass] = await tx.insert(administrativeClasses).values({ code: "TEST-GA-class", majorId: major.id, cohort: 97 }).returning();
  const people = await tx
    .insert(students)
    .values(
      [1, 2].map((index) => ({
        code: `999000000${index}`,
        fullName: `Sinh viên sửa điểm ${index}`,
        gender: "female" as const,
        dateOfBirth: "2010-01-01",
        email: `test-ga-${index}@student.hcmue.edu.vn`,
        administrativeClassId: homeClass.id,
      })),
    )
    .returning();
  const [section] = await tx
    .insert(classSections)
    .values({ termId: first.id, courseId: course.id, sectionNumber: 1, code: "TEST-GA.01", capacity: 10, status: "open", startDate: "2032-01-05", endDate: "2032-05-01" })
    .returning();
  const roster = await tx
    .insert(enrollments)
    .values(people.map((person) => ({ studentId: person.id, classSectionId: section.id, termId: first.id, courseId: course.id })))
    .returning();
  const [sheet] = await tx.insert(gradeSheets).values({ classSectionId: section.id, deadline: new Date("2032-05-15") }).returning();
  const components = await tx
    .insert(gradeComponents)
    .values([
      { gradeSheetId: sheet.id, key: "midterm", label: "Giữa kỳ", weight: 40, position: 1 },
      { gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 60, position: 2 },
    ])
    .returning();
  if (options.deferFirst) await tx.insert(examDeferrals).values({ enrollmentId: roster[0].id, kind: "final", reason: "Ốm" });
  // Sinh viên 1: 6 và 7 (tổng 6,6 C+); sinh viên 2: 8 và 9. Sinh viên 1 hoãn thi thì bỏ trống cuối kỳ.
  await tx.insert(gradeScores).values([
    { gradeComponentId: components[0].id, enrollmentId: roster[0].id, score: 6 },
    ...(options.deferFirst ? [] : [{ gradeComponentId: components[1].id, enrollmentId: roster[0].id, score: 7 }]),
    { gradeComponentId: components[0].id, enrollmentId: roster[1].id, score: 8 },
    { gradeComponentId: components[1].id, enrollmentId: roster[1].id, score: 9 },
  ]);
  if (options.publish) {
    const publishedAt = options.publishedAt ?? new Date();
    await tx.update(gradeSheets).set({ status: "locked", lockedAt: publishedAt }).where(eq(gradeSheets.id, sheet.id));
    await tx.update(gradeSheets).set({ status: "approved", approvedAt: publishedAt }).where(eq(gradeSheets.id, sheet.id));
    await tx.update(gradeSheets).set({ status: "published", publishedAt }).where(eq(gradeSheets.id, sheet.id));
    await tx.insert(courseResults).values([
      options.deferFirst
        ? { studentId: people[0].id, courseId: course.id, termId: first.id, enrollmentId: roster[0].id, letter: "I" }
        : { studentId: people[0].id, courseId: course.id, termId: first.id, enrollmentId: roster[0].id, score10: 6.6, letter: "C+", point4: 2.5 },
      { studentId: people[1].id, courseId: course.id, termId: first.id, enrollmentId: roster[1].id, score10: 8.6, letter: "A", point4: 4 },
    ]);
  }
  const request = async (kind: "regrade" | "withdraw" | "exam-postpone" | "credit-transfer", studentIndex = 0) => {
    const [row] = await tx
      .insert(academicRequests)
      .values({
        code: `DT-2032-${String(Math.floor(Math.random() * 90000) + 10000)}`,
        kind,
        requesterStudentId: people[studentIndex].id,
        facultyId: faculty.id,
        classSectionId: kind === "credit-transfer" ? null : section.id,
        subject: "Kiểm thử",
        reason: "Kiểm thử",
      })
      .returning();
    return row;
  };
  return { course, first, second, people, section, roster, sheet, components, faculty, request };
}

const resultOf = async (tx: Transaction, enrollmentId: string) => (await tx.select().from(courseResults).where(eq(courseResults.enrollmentId, enrollmentId)))[0];

describe("grades: ràng buộc ký hiệu ở DB", () => {
  test("W, I không có điểm số, chỉ cho học trên lớp; M chỉ cho kết quả miễn", async () => {
    await inRollback(async (tx) => {
      const { people, course, first, roster } = await makeClass(tx);
      const base = { studentId: people[0].id, courseId: course.id, termId: first.id };
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, enrollmentId: roster[0].id, letter: "W", score10: 5, point4: 1 })),
        GRADES_CONSTRAINT_MESSAGE.course_results_graded_together,
      );
      assert.equal(await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, source: "transfer", letter: "W" })), GRADES_CONSTRAINT_MESSAGE.course_results_class_marks);
      assert.equal(await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, source: "transfer", letter: "M" })), GRADES_CONSTRAINT_MESSAGE.course_results_exemption_mark);
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, source: "exemption", letter: "A", score10: 9, point4: 4 })),
        GRADES_CONSTRAINT_MESSAGE.course_results_exemption_mark,
      );
      await tx.insert(courseResults).values({ ...base, source: "exemption", letter: "M" });
    });
  });

  test("đăng ký đã rút phải có thời điểm rút, không còn tính sĩ số lớp", async () => {
    await inRollback(async (tx) => {
      const { roster, section } = await makeClass(tx);
      assert.equal(await messageOf(tx, (inner) => inner.update(enrollments).set({ status: "withdrawn" }).where(eq(enrollments.id, roster[0].id))), GRADES_CONSTRAINT_MESSAGE.enrollments_withdrawn_at_matches_status);
      await tx.update(enrollments).set({ status: "withdrawn", withdrawnAt: new Date() }).where(eq(enrollments.id, roster[0].id));
      const [after] = await tx.select({ enrolledCount: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, section.id));
      assert.equal(after.enrolledCount, 1);
    });
  });
});

describe("grades: sửa điểm sau công bố", () => {
  test("bảng điểm đã công bố không sửa thẳng được; đề nghị, không tự duyệt, duyệt thì áp điểm và tính lại kết quả", async () => {
    await inRollback(async (tx) => {
      const { section, roster, people, components, sheet } = await makeClass(tx, { publish: true });
      const { lecturer, admin } = await accounts(tx);
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeScores).set({ score: 9 }).where(and(eq(gradeScores.enrollmentId, roster[0].id), eq(gradeScores.gradeComponentId, components[1].id)))),
        GRADES_CONSTRAINT_MESSAGE.grade_scores_sheet_locked,
      );
      const proposal = { classSectionId: section.id, studentId: people[0].id, componentKey: "final", newScore: 9, reason: "Cộng sai điểm câu 3", source: "grade-change" as const, requester: lecturer };
      assert.equal(await messageOf(tx, (inner) => proposeGradeAmendment(inner, { ...proposal, newScore: 7 })), "Điểm mới trùng điểm hiện tại.");
      const { id } = await proposeGradeAmendment(tx, proposal);
      assert.match(await messageOf(tx, (inner) => proposeGradeAmendment(inner, proposal)), /đang có đề nghị sửa điểm chờ duyệt/);
      assert.match(await messageOf(tx, (inner) => decideGradeAmendment(inner, { id, decision: "approved", note: "", actor: lecturer })), /không tự duyệt/);
      assert.equal(
        await messageOf(tx, (inner) =>
          inner.update(gradeAmendments).set({ status: "approved", decidedByUserId: lecturer.userId, decidedByName: "x", decidedAt: new Date(), resultAfter: "x" }).where(eq(gradeAmendments.id, id)),
        ),
        GRADES_CONSTRAINT_MESSAGE.grade_amendments_not_self_approved,
      );
      const decided = await decideGradeAmendment(tx, { id, decision: "approved", note: "", actor: admin });
      // 6 x 40% + 9 x 60% = 7,8 (B) theo quy chế áp dụng ngày công bố.
      assert.equal(decided.resultAfter, "7,8 (B)");
      const [score] = await tx.select({ score: gradeScores.score }).from(gradeScores).where(and(eq(gradeScores.enrollmentId, roster[0].id), eq(gradeScores.gradeComponentId, components[1].id)));
      assert.equal(score.score, 9);
      const result = await resultOf(tx, roster[0].id);
      assert.deepEqual([result.score10, result.letter, result.point4], [7.8, "B", 3]);
      const [row] = await tx.select().from(gradeAmendments).where(eq(gradeAmendments.id, id));
      assert.deepEqual([row.status, row.oldScore, row.resultBefore, row.resultAfter, row.decidedByUserId], ["approved", 7, "6,6 (C+)", "7,8 (B)", admin.userId]);
      assert.equal(await messageOf(tx, (inner) => inner.update(gradeAmendments).set({ newScore: 10 }).where(eq(gradeAmendments.id, id))), GRADES_CONSTRAINT_MESSAGE.grade_amendments_decided_locked);
      assert.match(await messageOf(tx, (inner) => decideGradeAmendment(inner, { id, decision: "rejected", note: "x", actor: admin })), /đã được xử lý/);
      const notified = await tx
        .select({ title: notifications.title })
        .from(notifications)
        .innerJoin(user, eq(user.id, notifications.recipientUserId))
        .where(eq(user.username, "cb0021"));
      assert.ok(notified.some((entry) => entry.title.includes("TEST-GA.01")), "Phòng Đào tạo được báo có đề nghị chờ duyệt");
      assert.ok(sheet.id);
    });
  });

  test("từ chối giữ nguyên điểm; ô khác sinh viên khác lớp bị DB chặn", async () => {
    await inRollback(async (tx) => {
      const { section, people, roster, sheet, components } = await makeClass(tx, { publish: true });
      const { lecturer, admin } = await accounts(tx);
      const { id } = await proposeGradeAmendment(tx, { classSectionId: section.id, studentId: people[1].id, componentKey: "midterm", newScore: 5, reason: "Nhầm", source: "manual", requester: admin });
      await decideGradeAmendment(tx, { id, decision: "rejected", note: "Không có minh chứng", actor: lecturer });
      const result = await resultOf(tx, roster[1].id);
      assert.equal(result.letter, "A");
      const [row] = await tx.select({ status: gradeAmendments.status, note: gradeAmendments.decisionNote }).from(gradeAmendments).where(eq(gradeAmendments.id, id));
      assert.deepEqual(row, { status: "rejected", note: "Không có minh chứng" });
      const [other] = await tx.select({ id: enrollments.id, studentId: enrollments.studentId }).from(enrollments).where(sql`${enrollments.classSectionId} <> ${section.id}`).limit(1);
      assert.equal(
        await messageOf(tx, (inner) =>
          inner.insert(gradeAmendments).values({
            gradeSheetId: sheet.id,
            gradeComponentId: components[0].id,
            enrollmentId: other.id,
            studentId: other.studentId,
            componentLabel: "Giữa kỳ",
            newScore: 5,
            reason: "x",
            source: "manual",
            requestedByName: "x",
          }),
        ),
        GRADES_CONSTRAINT_MESSAGE.grade_amendments_same_sheet,
      );
    });
  });

  test("tính lại theo bản quy chế áp dụng ngày công bố, không theo bản hiện hành", async () => {
    await inRollback(async (tx) => {
      const today = dayjs(schoolToday());
      const lenient = { ...REGULATION_RULES, grading: { ...REGULATION_RULES.grading, scale: [{ letter: "A", min: 5, point4: 4 }, { letter: "F", min: 0, point4: 0 }] } };
      await tx.insert(regulations).values([
        { version: "TEST.1", effectiveFrom: today.subtract(20, "day").format("YYYY-MM-DD"), decision: "KT", summary: "Kiểm thử", rules: lenient },
        { version: "TEST.2", effectiveFrom: today.subtract(5, "day").format("YYYY-MM-DD"), decision: "KT", summary: "Kiểm thử", rules: REGULATION_RULES },
      ]);
      const { section, people, roster } = await makeClass(tx, { publish: true, publishedAt: today.subtract(10, "day").hour(10).toDate() });
      const { lecturer, admin } = await accounts(tx);
      const { id } = await proposeGradeAmendment(tx, { classSectionId: section.id, studentId: people[0].id, componentKey: "final", newScore: 6, reason: "Nhập nhầm", source: "grade-change", requester: lecturer });
      await decideGradeAmendment(tx, { id, decision: "approved", note: "", actor: admin });
      // 6 x 40% + 6 x 60% = 6,0: thang ngày công bố (A từ 5) ra A, thang hiện hành ra C.
      const result = await resultOf(tx, roster[0].id);
      assert.deepEqual([result.score10, result.letter], [6, "A"]);
    });
  });
});

describe("grades: điểm I", () => {
  test("hoãn thi được chốt điểm khi thiếu cột thi; thi bù có điểm thì đề nghị sửa điểm thay I", async () => {
    await inRollback(async (tx) => {
      const { sheet } = await makeClass(tx, { deferFirst: true });
      await tx.update(gradeSheets).set({ status: "locked", lockedAt: new Date() }).where(eq(gradeSheets.id, sheet.id));
    });
    await inRollback(async (tx) => {
      const { section, people, roster } = await makeClass(tx, { deferFirst: true, publish: true });
      const { lecturer, admin } = await accounts(tx);
      assert.equal((await resultOf(tx, roster[0].id)).letter, "I");
      const transcript = (await loadTranscripts(tx, [people[0].id])).get(people[0].id)!;
      assert.equal(computeStanding(people[0].id, transcript, RULES).cpa4, null, "I không tính CPA");
      const { id } = await proposeGradeAmendment(tx, { classSectionId: section.id, studentId: people[0].id, componentKey: "final", newScore: 8, reason: "Điểm thi bù", source: "manual", requester: admin });
      await decideGradeAmendment(tx, { id, decision: "approved", note: "", actor: lecturer });
      const result = await resultOf(tx, roster[0].id);
      assert.deepEqual([result.score10, result.letter], [7.2, "B"]);
    });
  });

  test("chưa đủ điểm (không hoãn thi) thì vẫn không chốt được", async () => {
    await inRollback(async (tx) => {
      const { sheet, roster, components } = await makeClass(tx);
      await tx.delete(gradeScores).where(and(eq(gradeScores.enrollmentId, roster[1].id), eq(gradeScores.gradeComponentId, components[1].id)));
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeSheets).set({ status: "locked", lockedAt: new Date() }).where(eq(gradeSheets.id, sheet.id))),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_incomplete,
      );
    });
  });

  test("tác vụ chuyển I quá hạn thành F, báo sinh viên một lần, chạy lại không trùng", async () => {
    await inRollback(async (tx) => {
      const { roster, people } = await makeClass(tx, { deferFirst: true, publish: true });
      const notYet = await convertOverdueIncompletes(tx, "2032-08-30");
      assert.equal(notYet.incompletesConverted, 0, "học kỳ kế tiếp chưa kết thúc");
      const first = await convertOverdueIncompletes(tx, "2032-09-01");
      assert.equal(first.incompletesConverted, 1);
      const again = await convertOverdueIncompletes(tx, "2032-09-02");
      assert.equal(again.incompletesConverted, 0);
      const result = await resultOf(tx, roster[0].id);
      assert.deepEqual([result.score10, result.letter, result.point4], [0, "F", 0]);
      const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, people[0].id));
      assert.equal(student.userId, null, "sinh viên kiểm thử chưa có tài khoản nên không có thông báo");
    });
  });
});

describe("grades: kết quả đơn được duyệt", () => {
  const actor = { userId: null, name: "Cán bộ kiểm thử", role: "Phòng Đào tạo" };
  const approved = (row: { id: string; code: string; requesterStudentId: string | null; classSectionId: string | null }, effect?: unknown): GradeApprovedRequest => ({
    ...row,
    requesterLecturerId: null,
    details: [],
    actor,
    effect,
  });

  test("rút học phần: đăng ký chuyển đã rút, kết quả W gắn đơn, không tính CPA", async () => {
    await inRollback(async (tx) => {
      const { request, roster, people } = await makeClass(tx);
      const row = await request("withdraw");
      await GRADE_REQUEST_HANDLERS.withdraw(approved(row), tx);
      const [enrollment] = await tx.select({ status: enrollments.status, withdrawnAt: enrollments.withdrawnAt }).from(enrollments).where(eq(enrollments.id, roster[0].id));
      assert.equal(enrollment.status, "withdrawn");
      assert.ok(enrollment.withdrawnAt);
      const result = await resultOf(tx, roster[0].id);
      assert.deepEqual([result.letter, result.score10, result.requestId], ["W", null, row.id]);
      await assert.rejects(GRADE_REQUEST_HANDLERS.withdraw(approved(row), tx), /không còn đăng ký/);
      const transcript = (await loadTranscripts(tx, [people[0].id])).get(people[0].id)!;
      assert.equal(transcript[0].courses[0].letter, "W");
    });
  });

  test("hoãn thi: ghi exam_deferrals gắn đơn, ghi lần hai bị chặn", async () => {
    await inRollback(async (tx) => {
      const { request, roster } = await makeClass(tx);
      const row = await request("exam-postpone");
      await GRADE_REQUEST_HANDLERS["exam-postpone"](approved(row, { examKind: "midterm" }), tx);
      const [deferral] = await tx.select().from(examDeferrals).where(eq(examDeferrals.enrollmentId, roster[0].id));
      assert.deepEqual([deferral.kind, deferral.requestId], ["midterm", row.id]);
      const again = await request("exam-postpone");
      await assert.rejects(GRADE_REQUEST_HANDLERS["exam-postpone"](approved(again, { examKind: "midterm" }), tx), /đã được ghi nhận hoãn thi/);
    });
  });

  test("phúc khảo: bắt buộc nhập điểm sau chấm lại; điểm đổi thì sinh đề nghị đã duyệt và tính lại", async () => {
    await inRollback(async (tx) => {
      const { request, roster } = await makeClass(tx, { publish: true });
      const row = await request("regrade");
      await assert.rejects(GRADE_REQUEST_HANDLERS.regrade(approved(row), tx), /Nhập điểm sau phúc khảo/);
      await GRADE_REQUEST_HANDLERS.regrade(approved(row, { newScore: 7 }), tx);
      assert.equal((await tx.select().from(gradeAmendments).where(eq(gradeAmendments.enrollmentId, roster[0].id))).length, 0, "giữ nguyên thì không sinh đề nghị");
      await GRADE_REQUEST_HANDLERS.regrade(approved(row, { newScore: 8.5 }), tx);
      const [amendment] = await tx.select().from(gradeAmendments).where(eq(gradeAmendments.requestId, row.id));
      assert.deepEqual([amendment.status, amendment.source, amendment.oldScore, amendment.newScore], ["approved", "regrade", 7, 8.5]);
      assert.equal((await resultOf(tx, roster[0].id)).score10, 7.5);
    });
  });

  test("công nhận, miễn: ghi điểm công nhận và M, học phần đã đạt không công nhận lại", async () => {
    await inRollback(async (tx) => {
      const { request, people } = await makeClass(tx);
      const [first, second] = await tx.select({ id: courses.id, code: courses.code, credits: courses.credits }).from(courses).where(sql`${courses.code} IN ('COMP1010', 'COMP1020')`).orderBy(courses.code);
      const row = await request("credit-transfer");
      await assert.rejects(GRADE_REQUEST_HANDLERS["credit-transfer"](approved(row, { courses: [] }), tx), /ít nhất một học phần/);
      await GRADE_REQUEST_HANDLERS["credit-transfer"](
        approved(row, {
          courses: [
            { courseId: first.id, mode: "transfer", score10: 8 },
            { courseId: second.id, mode: "exemption" },
          ],
        }),
        tx,
      );
      const rows = await tx.select({ source: courseResults.source, letter: courseResults.letter, requestId: courseResults.requestId }).from(courseResults).where(eq(courseResults.studentId, people[0].id));
      assert.deepEqual(rows.map((entry) => [entry.source, entry.letter, entry.requestId]).toSorted(), [["exemption", "M", row.id], ["transfer", "B+", row.id]].toSorted());
      const standing = computeStanding(people[0].id, (await loadTranscripts(tx, [people[0].id])).get(people[0].id)!, RULES);
      assert.equal(standing.earnedCredits, first.credits + second.credits);
      assert.equal(standing.cpa4, 3.5, "chỉ học phần công nhận điểm vào CPA");
      const again = await request("credit-transfer");
      await assert.rejects(GRADE_REQUEST_HANDLERS["credit-transfer"](approved(again, { courses: [{ courseId: second.id, mode: "exemption" }] }), tx), /đã học đạt/);
    });
  });
});
