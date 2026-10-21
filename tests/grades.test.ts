import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { dayjs } from "@/shared/libs/date.lib";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, majors } from "@/modules/curriculum/curriculum.schema";
import { GRADES_CONSTRAINT_MESSAGE } from "@/modules/grades/grades.constant";
import ExcelJS from "exceljs";
import { gradeSheetWorkbook, readWorkbookMatrix } from "@/modules/grades/grades.excel";
import { cumulativeResults, currentWarningLevel, currentWarnings, GradeActionError, loadTranscripts, replaceGradeComponents, syncAcademicWarnings } from "@/modules/grades/grades.lib";
import {
  buildTranscript,
  componentKey,
  computeStanding,
  consecutiveWarnings,
  creditAverage,
  expulsionReasons,
  GRADE_COMPONENTS_SAVE_SCHEMA,
  GRADE_SCORES_SAVE_SCHEMA,
  GRADE_SHEET_RETURN_SCHEMA,
  gradeEntryDeadline,
  latestAttempts,
  latestGrades,
  latestWarningTerm,
  letterOf,
  parseScoreMatrix,
  planComponentChanges,
  planWarningSync,
  roundingFormula,
  sheetState,
  standingRulesOf,
  summarizeStandings,
  toStanding,
  warningLevelOf,
  warningReasons,
  weightedScore,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { TranscriptCourseInput } from "@/modules/grades/grades.type";
import { notifications } from "@/modules/notifications/notifications.schema";
import { REGULATION_RULES } from "@/modules/settings/settings.mock";
import { mockTermId } from "@/shared/libs/mock.lib";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const SCALE = REGULATION_RULES.grading.scale;
const RULES = standingRulesOf(REGULATION_RULES);
const WARNING = REGULATION_RULES.warning;

function graded(code: string, credits: number, score10: number | null): TranscriptCourseInput {
  if (score10 === null) return { courseCode: code, courseName: code, credits, score10: null, letter: null, point4: null };
  return { courseCode: code, courseName: code, credits, score10, ...letterOf(score10, SCALE) };
}

describe("grades: quy đổi điểm theo quy chế", () => {
  test("điểm chữ và thang 4 đúng ở các mốc của thang điểm quy chế", () => {
    assert.deepEqual([8.5, 8.4, 8, 7, 6.5, 5.5, 5, 4, 3.9, 0].map((score) => letterOf(score, SCALE).letter), ["A", "B+", "B+", "B", "C+", "C", "D+", "D", "F", "F"]);
    assert.equal(letterOf(6.9, SCALE).point4, 2.5);
    const old = SCALE.filter((step) => !step.letter.endsWith("+"));
    assert.equal(letterOf(8.2, old).letter, "B");
  });

  test("điểm tổng kết theo trọng số, làm tròn theo bước của quy chế; thiếu một cột thì chưa có điểm", () => {
    const components = [
      { key: "attendance", label: "Chuyên cần", weight: 10 },
      { key: "midterm", label: "Giữa kỳ", weight: 30 },
      { key: "final", label: "Cuối kỳ", weight: 60 },
    ];
    assert.equal(weightedScore(components, { attendance: 10, midterm: 7.25, final: 6.5 }, 0.1), 7.1);
    assert.equal(weightedScore(components, { attendance: 10, midterm: 7, final: null }, 0.1), null);
    assert.equal(weightedScore(components, { attendance: 0.02, midterm: 0.3, final: 6.43 }, 0.1), 4);
    assert.equal(weightedScore(components, { attendance: 1.15, midterm: 1.15, final: 1.15 }, 0.1), 1.2);
    assert.equal(weightedScore(components, { attendance: 7, midterm: 7, final: 7.24 }, 0.5), 7);
    assert.equal(weightedScore(components, { attendance: 7, midterm: 7, final: 7.42 }, 0.5), 7.5);
    assert.equal(weightedScore(components, { attendance: 6, midterm: 6, final: 6.5 }, 1), 6);
    assert.equal(roundingFormula("(C2*10+D2*90)", 0.1), "ROUND(ROUND((C2*10+D2*90),6)/100,1)");
    assert.equal(roundingFormula("(X)", 0.5), "ROUND(ROUND((X),6)/100*2,0)/2");
  });

  test("xếp loại theo ngưỡng CPA của quy chế; đổi ngưỡng thì xếp loại đổi theo", () => {
    const thresholds = REGULATION_RULES.grading.standing;
    assert.deepEqual(
      [3.6, 3.59, 3.2, 2.5, 2, 1.99, 1, 0.5].map((cpa) => toStanding(cpa, thresholds)),
      ["excellent", "very-good", "very-good", "good", "average", "weak", "weak", "poor"],
    );
    assert.equal(toStanding(3.59, { ...thresholds, excellent: 3.5 }), "excellent");
  });

  test("trung bình làm tròn 2 chữ số tính trên số nguyên (khớp round của Postgres)", () => {
    assert.equal(creditAverage([{ credits: 2, point4: 2.5, score10: null }, { credits: 1, point4: 3.5, score10: null }], "point4"), 2.83);
    assert.equal(creditAverage([{ credits: 1, point4: 1.5, score10: null }, { credits: 1, point4: 2, score10: null }], "point4"), 1.75);
    assert.equal(creditAverage([{ credits: 1, point4: null, score10: 8.24 }, { credits: 1, point4: null, score10: 8.25 }], "score10"), 8.25);
  });
});

describe("grades: GPA, CPA theo lần học cuối, cảnh báo học vụ", () => {
  const sample = [
    { termId: "t1", termName: "HK1", isInProgress: false, courses: [graded("A", 3, 9), graded("B", 2, 6), graded("C", 3, 3)] },
    { termId: "t2", termName: "HK2", isInProgress: false, courses: [graded("C", 3, 7), graded("D", 4, 8.5)] },
    { termId: "t3", termName: "HK3", isInProgress: true, courses: [graded("E", 3, null), graded("F", 2, 9)] },
  ];
  const transcript = buildTranscript(sample);

  test("GPA kỳ theo học phần trong kỳ; CPA tính lần học cuối của mỗi học phần; kỳ đang học không có CPA", () => {
    assert.equal(transcript[0].gpa4, 2);
    assert.equal(transcript[0].gpa10, 6);
    assert.equal(transcript[1].gpa4, 3.57);
    assert.equal(transcript[0].cpa4, 2);
    assert.equal(transcript[1].cpa4, 3.42);
    assert.equal(transcript[0].earnedCredits, 5);
    assert.equal(transcript[0].attemptedCredits, 8);
    assert.equal(transcript[2].cpa4, null);
    assert.equal(transcript[2].earnedCredits, 0);
    assert.equal(transcript[2].gpa4, 4);
  });

  test("lần học trước bị lần sau thay thế; lần sau ghi học lại hoặc học cải thiện", () => {
    const first = transcript[0].courses.find((course) => course.courseCode === "C")!;
    const retake = transcript[1].courses.find((course) => course.courseCode === "C")!;
    assert.deepEqual([first.attempt, first.replaced, first.retakeKind], [1, true, null]);
    assert.deepEqual([retake.attempt, retake.replaced, retake.retakeKind], [2, false, "retake"]);
    const improved = buildTranscript([sample[0], { ...sample[1], courses: [graded("B", 2, 4.5)] }]);
    const lower = improved[1].courses[0];
    assert.equal(lower.retakeKind, "improve");
    assert.equal(improved[1].cpa4, creditAverage([graded("A", 3, 9), graded("B", 2, 4.5), graded("C", 3, 3)], "point4"));
  });

  test("tín chỉ tích lũy mỗi học phần một lần; nợ là học phần lần cuối F; học lại đạt thì hết nợ", () => {
    const standing = computeStanding("sv", transcript, RULES);
    assert.equal(standing.cpa4, 3.42);
    assert.equal(standing.earnedCredits, 12);
    assert.equal(standing.failedCredits, 0);
    assert.equal(standing.retakeCredits, 3);
    assert.equal(standing.lastTermGpa4, 3.57);
    assert.equal(standing.standing, "very-good");
    assert.equal(standing.warningLevel, 0);
    const failedAgain = computeStanding("sv", buildTranscript([sample[0], { ...sample[1], courses: [graded("A", 3, 2)] }]), RULES);
    assert.equal(failedAgain.earnedCredits, 2);
    assert.equal(failedAgain.failedCredits, 6);
    assert.deepEqual(latestGrades(buildTranscript([sample[0], { ...sample[1], courses: [graded("A", 3, 2)] }])), { A: "F", B: "C", C: "F" });
  });

  test("lần học cuối của danh sách lần học theo thời gian (cho kiểm tiên quyết khi đăng ký)", () => {
    const attempts = [
      { courseCode: "X", letter: "B", point4: 3 },
      { courseCode: "Y", letter: "F", point4: 0 },
      { courseCode: "X", letter: "F", point4: 0 },
      { courseCode: "Y", letter: null, point4: null },
    ];
    const latest = latestAttempts(attempts);
    assert.equal(latest.get("X")?.letter, "F");
    assert.equal(latest.get("Y")?.letter, "F");
  });

  test("không có điểm thì Chưa xếp loại (không phải Kém), không cảnh báo", () => {
    assert.equal(creditAverage([], "point4"), null);
    const standing = computeStanding("sv", [], RULES);
    assert.equal(standing.cpa4, null);
    assert.equal(standing.standing, null);
    assert.equal(standing.warningLevel, 0);
  });

  test("ngưỡng cảnh báo lấy từ quy chế; đổi ngưỡng thì mức và lý do đổi theo", () => {
    const base = { hasCourses: true, cpa4: 2.5, failedCredits: 0, lastTermGpa4: 2.5 };
    assert.equal(warningLevelOf({ ...base, cpa4: 0.99 }, WARNING), 3);
    assert.equal(warningLevelOf({ ...base, cpa4: 1.49 }, WARNING), 2);
    assert.equal(warningLevelOf({ ...base, failedCredits: 12 }, WARNING), 2);
    assert.equal(warningLevelOf({ ...base, failedCredits: 6 }, WARNING), 1);
    assert.equal(warningLevelOf({ ...base, lastTermGpa4: 0.9 }, WARNING), 1);
    assert.equal(warningLevelOf({ ...base, failedCredits: 5 }, WARNING), 0);
    assert.equal(warningLevelOf({ ...base, cpa4: 0, hasCourses: false }, WARNING), 0);
    const stricter = { ...WARNING, level2Cpa: 2.6, level1FailedCredits: 4 };
    assert.equal(warningLevelOf(base, stricter), 2);
    assert.equal(warningLevelOf({ ...base, cpa4: 3, failedCredits: 4 }, stricter), 1);
    assert.deepEqual(warningReasons({ cpa4: 1.2, lastTermGpa4: 0.5, failedCredits: 9 }, WARNING), [
      "CPA 1,20 dưới ngưỡng 1,5",
      "ĐTB học kỳ gần nhất 0,50 dưới ngưỡng 1,0",
      "Nợ 9 tín chỉ (từ 6 tín chỉ)",
    ]);
    assert.deepEqual(warningReasons({ cpa4: 2.5, lastTermGpa4: 2.5, failedCredits: 0 }, stricter), ["CPA 2,50 dưới ngưỡng 2,6"]);
  });

  test("đề xuất buộc thôi học: đủ số học kỳ chính liên tiếp bị cảnh báo theo quy chế, hoặc mức 3", () => {
    const mainTerms = ["k1", "k2", "k3", "k4"];
    assert.equal(consecutiveWarnings(mainTerms, new Set(["k3", "k4"])), 2);
    assert.equal(consecutiveWarnings(mainTerms, new Set(["k1", "k2", "k4"])), 1);
    assert.deepEqual(expulsionReasons({ consecutive: 1, level: 1 }, WARNING), []);
    assert.deepEqual(expulsionReasons({ consecutive: 2, level: 1 }, WARNING), ["Bị cảnh báo 2 học kỳ chính liên tiếp (quy chế: 2)"]);
    assert.equal(expulsionReasons({ consecutive: 2, level: 1 }, { ...WARNING, expelAfterWarnings: 3 }).length, 0);
    assert.deepEqual(expulsionReasons({ consecutive: 1, level: 3 }, WARNING), ["Cảnh báo mức 3: CPA dưới 1,0"]);
  });

  test("tổng hợp xếp loại theo khoa: chưa có điểm không vào thống kê, cảnh báo theo cảnh báo chính thức", () => {
    const standing = computeStanding("sv", transcript, RULES);
    const [summary] = summarizeStandings([
      { faculty: "Khoa A", standing, warned: false },
      { faculty: "Khoa A", standing: { cpa4: 1.25, standing: "weak" }, warned: true },
      { faculty: "Khoa A", standing: { cpa4: null, standing: null }, warned: false },
    ]);
    assert.equal(summary.total, 2);
    assert.equal(summary.unranked, 1);
    assert.equal(summary.averageCpa, 2.34);
    assert.equal(summary.counts["very-good"], 1);
    assert.equal(summary.counts.poor, 0);
    assert.equal(summary.warnings, 1);
  });

  test("hạn nhập điểm theo quy chế: từ ngày thi cuối kỳ, chưa có lịch thi thì từ ngày kết thúc học kỳ; sắp hết hạn theo số ngày nhắc", () => {
    assert.equal(gradeEntryDeadline({ finalExamDate: "2027-01-08", termEnd: "2027-01-16" }, 10), "2027-01-18T16:59:00.000Z");
    assert.equal(gradeEntryDeadline({ finalExamDate: null, termEnd: "2027-01-16" }, 10), "2027-01-26T16:59:00.000Z");
    const now = dayjs("2026-10-19T10:00:00Z");
    assert.equal(sheetState("draft", "2026-10-18T16:59:00Z", 5, now), "overdue");
    assert.equal(sheetState("draft", "2026-10-22T16:59:00Z", 5, now), "due-soon");
    assert.equal(sheetState("draft", "2026-10-22T16:59:00Z", 2, now), "in-progress");
    assert.equal(sheetState("draft", "2026-11-30T16:59:00Z", 5, now), "in-progress");
    assert.equal(sheetState("locked", "2026-10-18T16:59:00Z", 5, now), "locked");
  });
});

describe("grades: kiểm dữ liệu nhập điểm", () => {
  const sectionId = "0192f3a4-0000-7000-8000-000000000000";
  test("điểm ngoài 0–10 hoặc quá 2 chữ số thập phân bị chặn ở form, ô trống được phép", () => {
    const parsed = parseInput(GRADE_SCORES_SAVE_SCHEMA, {
      classSectionId: sectionId,
      changes: [
        { studentId: sectionId, key: "final", score: 10.5 },
        { studentId: sectionId, key: "final", score: 7.333 },
        { studentId: sectionId, key: "final", score: -1 },
      ],
    });
    assert.ok(!parsed.ok);
    assert.equal(!parsed.ok && parsed.fieldErrors?.["changes.0.score"], "Điểm từ 0 đến 10");
    assert.equal(!parsed.ok && parsed.fieldErrors?.["changes.1.score"], "Điểm lấy tối đa 2 chữ số thập phân");
    assert.ok(parseInput(GRADE_SCORES_SAVE_SCHEMA, { classSectionId: sectionId, changes: [{ studentId: sectionId, key: "final", score: null }] }).ok);
  });

  test("trả lại bảng điểm phải ghi lý do", () => {
    const parsed = parseInput(GRADE_SHEET_RETURN_SCHEMA, { classSectionId: sectionId, reason: "   " });
    assert.ok(!parsed.ok);
    assert.equal(!parsed.ok && parsed.fieldErrors?.reason, "Ghi lý do trả lại để giảng viên biết cần sửa gì");
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
      await inner.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
    })
    .then(() => null)
    .catch((caught: unknown) => caught);
  assert.ok(error, "lệnh phải bị DB chặn");
  return pgErrorMessage(error, GRADES_CONSTRAINT_MESSAGE);
}

async function makeSheet(tx: Transaction) {
  const [course] = await tx.select().from(courses).where(eq(courses.code, "COMP1070"));
  const [major] = await tx.select().from(majors).limit(1);
  const [term] = await tx
    .insert(terms)
    .values({ code: "TEST-GR-term", name: "Học kỳ kiểm thử điểm", shortName: "Kiểm thử", academicYear: 2032, semester: 1, startDate: "2032-01-01", endDate: "2032-05-01" })
    .returning();
  const [homeClass] = await tx.insert(administrativeClasses).values({ code: "TEST-GR-class", majorId: major.id, cohort: 98 }).returning();
  const people = await tx
    .insert(students)
    .values(
      [1, 2].map((index) => ({
        code: `TEST-GR-${index}`,
        fullName: `Sinh viên kiểm thử điểm ${index}`,
        gender: "male" as const,
        dateOfBirth: "2010-01-01",
        email: `test-gr-${index}@student.hcmue.edu.vn`,
        administrativeClassId: homeClass.id,
      })),
    )
    .returning();
  const [section] = await tx
    .insert(classSections)
    .values({ termId: term.id, courseId: course.id, sectionNumber: 1, code: "TEST-GR.01", capacity: 10, status: "open", startDate: "2032-01-01", endDate: "2032-05-01" })
    .returning();
  const roster = await tx
    .insert(enrollments)
    .values(people.map((person) => ({ studentId: person.id, classSectionId: section.id, termId: term.id, courseId: course.id })))
    .returning();
  const [sheet] = await tx.insert(gradeSheets).values({ classSectionId: section.id, deadline: new Date("2032-05-15") }).returning();
  const components = await tx
    .insert(gradeComponents)
    .values([
      { gradeSheetId: sheet.id, key: "midterm", label: "Giữa kỳ", weight: 40, position: 1 },
      { gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 60, position: 2 },
    ])
    .returning();
  return { term, course, sheet, components, roster };
}

describe("grades: ràng buộc ở DB", () => {
  test("điểm ngoài 0–10, tổng trọng số khác 100 bị chặn với câu tiếng Việt", async () => {
    await inRollback(async (tx) => {
      const { components, roster, sheet } = await makeSheet(tx);
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(gradeScores).values({ gradeComponentId: components[0].id, enrollmentId: roster[0].id, score: 10.25 })),
        GRADES_CONSTRAINT_MESSAGE.grade_scores_range,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeComponents).set({ weight: 30 }).where(eq(gradeComponents.id, components[0].id))),
        GRADES_CONSTRAINT_MESSAGE.grade_components_weights_total_100,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(gradeSheets).values({ classSectionId: sheet.classSectionId, deadline: new Date("2032-05-15") })),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_class_section_id_unique,
      );
    });
  });

  test("chưa nhập đủ thì không chốt được; chốt rồi thì không sửa điểm, không đổi cột điểm", async () => {
    await inRollback(async (tx) => {
      const { components, roster, sheet } = await makeSheet(tx);
      await tx.insert(gradeScores).values({ gradeComponentId: components[0].id, enrollmentId: roster[0].id, score: 8 });
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeSheets).set({ status: "locked", lockedAt: new Date() }).where(eq(gradeSheets.id, sheet.id))),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_incomplete,
      );
      await tx.insert(gradeScores).values(
        components.flatMap((component) => roster.map((entry) => ({ gradeComponentId: component.id, enrollmentId: entry.id, score: 7.5 }))),
      ).onConflictDoNothing();
      await tx.update(gradeSheets).set({ status: "locked", lockedAt: new Date() }).where(eq(gradeSheets.id, sheet.id));
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeScores).set({ score: 9 }).where(eq(gradeScores.enrollmentId, roster[0].id))),
        GRADES_CONSTRAINT_MESSAGE.grade_scores_sheet_locked,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.delete(gradeScores).where(eq(gradeScores.enrollmentId, roster[1].id))),
        GRADES_CONSTRAINT_MESSAGE.grade_scores_sheet_locked,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeComponents).set({ label: "Cuối kỳ mới" }).where(eq(gradeComponents.id, components[1].id))),
        GRADES_CONSTRAINT_MESSAGE.grade_components_sheet_locked,
      );
      await tx.update(gradeSheets).set({ status: "returned", returnReason: "Kiểm tra lại cột cuối kỳ" }).where(eq(gradeSheets.id, sheet.id));
      await tx.update(gradeScores).set({ score: 9 }).where(eq(gradeScores.enrollmentId, roster[0].id));
    });
  });

  test("bảng điểm đi đúng thứ tự nháp → chốt → duyệt → công bố", async () => {
    await inRollback(async (tx) => {
      const { components, roster, sheet } = await makeSheet(tx);
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeSheets).set({ status: "published", publishedAt: new Date() }).where(eq(gradeSheets.id, sheet.id))),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_status_flow,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeSheets).set({ status: "returned" }).where(eq(gradeSheets.id, sheet.id))),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_status_flow,
      );
      await tx.insert(gradeScores).values(components.flatMap((component) => roster.map((entry) => ({ gradeComponentId: component.id, enrollmentId: entry.id, score: 6 }))));
      for (const status of ["locked", "approved", "published"] as const) {
        await tx
          .update(gradeSheets)
          .set({ status, lockedAt: new Date(), ...(status === "published" && { publishedAt: new Date() }) })
          .where(eq(gradeSheets.id, sheet.id));
      }
      assert.equal(
        await messageOf(tx, (inner) => inner.update(gradeSheets).set({ status: "approved", publishedAt: null }).where(eq(gradeSheets.id, sheet.id))),
        GRADES_CONSTRAINT_MESSAGE.grade_sheets_status_flow,
      );
    });
  });

  test("kết quả học phần: điểm chữ thuộc thang, học trên lớp phải khớp đăng ký", async () => {
    await inRollback(async (tx) => {
      const { term, course, roster } = await makeSheet(tx);
      const base = { studentId: roster[0].studentId, courseId: course.id, termId: term.id };
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, source: "legacy", score10: 7, letter: "E", point4: 3 })),
        GRADES_CONSTRAINT_MESSAGE.course_results_letter,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, source: "class", score10: 7, letter: "B", point4: 3 })),
        GRADES_CONSTRAINT_MESSAGE.course_results_class_has_enrollment,
      );
      assert.equal(
        await messageOf(tx, (inner) => inner.insert(courseResults).values({ ...base, studentId: roster[1].studentId, enrollmentId: roster[0].id, score10: 7, letter: "B", point4: 3 })),
        GRADES_CONSTRAINT_MESSAGE.course_results_enrollment_fk,
      );
      await tx.insert(courseResults).values({ ...base, enrollmentId: roster[0].id, score10: 7, letter: "B", point4: 3 });
    });
  });
});

describe("grades: sửa cột điểm", () => {
  test("kiểm cột điểm: tên không trùng, tổng 100%, khóa cột mới sinh từ tên", () => {
    const sectionId = "0192f3a4-0000-7000-8000-000000000000";
    const bad = parseInput(GRADE_COMPONENTS_SAVE_SCHEMA, {
      classSectionId: sectionId,
      components: [
        { key: "midterm", label: "Giữa kỳ", weight: 40 },
        { key: null, label: "giữa kỳ", weight: 50 },
      ],
    });
    assert.ok(!bad.ok);
    assert.equal(bad.fieldErrors?.components, "Tên các cột điểm không được trùng nhau");
    const total = parseInput(GRADE_COMPONENTS_SAVE_SCHEMA, { classSectionId: sectionId, components: [{ key: null, label: "Cuối kỳ", weight: 90 }] });
    assert.equal(!total.ok && total.fieldErrors?.components, "Tổng trọng số các cột điểm phải bằng 100%");
    assert.equal(componentKey("Bài tập nhóm", new Set()), "bai-tap-nhom");
    assert.equal(componentKey("Đồ án", new Set(["do-an"])), "do-an-2");
    const plan = planComponentChanges(
      [
        { id: "a", key: "midterm" },
        { id: "b", key: "final" },
      ],
      [
        { key: "final", label: "Cuối kỳ", weight: 70 },
        { key: null, label: "Bài tập", weight: 30 },
      ],
    );
    assert.deepEqual(plan.removed.map((component) => component.key), ["midterm"]);
    assert.deepEqual(plan.kept.map((component) => [component.key, component.position]), [["final", 1]]);
    assert.deepEqual(plan.created.map((component) => [component.key, component.position]), [["bai-tap", 2]]);
  });

  test("đổi tên, trọng số, thêm cột trong một giao dịch; tổng khác 100 bị chặn; cột có điểm phải xác nhận; chốt rồi không đổi được", async () => {
    await inRollback(async (tx) => {
      const { components, roster, sheet } = await makeSheet(tx);
      await tx.insert(gradeScores).values({ gradeComponentId: components[0].id, enrollmentId: roster[0].id, score: 8 });
      await tx.transaction(async (inner) => {
        await replaceGradeComponents(inner, {
          gradeSheetId: sheet.id,
          components: [
            { key: null, label: "Chuyên cần", weight: 20 },
            { key: "midterm", label: "Giữa kỳ (bài tập)", weight: 30 },
            { key: "final", label: "Cuối kỳ", weight: 50 },
          ],
          confirmDropScores: false,
        });
        await inner.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      });
      const deferred = () => tx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
      await deferred();
      const saved = await tx.select().from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id)).orderBy(gradeComponents.position);
      assert.deepEqual(
        saved.map((component) => `${component.position}:${component.key}:${component.label}:${component.weight}`),
        ["1:chuyen-can:Chuyên cần:20", "2:midterm:Giữa kỳ (bài tập):30", "3:final:Cuối kỳ:50"],
      );
      const [kept] = await tx.select().from(gradeScores).where(eq(gradeScores.gradeComponentId, components[0].id));
      assert.equal(kept?.score, 8);

      assert.equal(
        await messageOf(tx, (inner) =>
          replaceGradeComponents(inner, {
            gradeSheetId: sheet.id,
            components: [
              { key: "midterm", label: "Giữa kỳ", weight: 30 },
              { key: "final", label: "Cuối kỳ", weight: 60 },
            ],
            confirmDropScores: false,
          }),
        ),
        GRADES_CONSTRAINT_MESSAGE.grade_components_weights_total_100,
      );
      await deferred();

      const dropMidterm = { gradeSheetId: sheet.id, components: [{ key: "final", label: "Cuối kỳ", weight: 100 }] };
      await assert.rejects(
        tx.transaction((inner) => replaceGradeComponents(inner, { ...dropMidterm, confirmDropScores: false })),
        (error: unknown) => error instanceof GradeActionError && error.message.startsWith("Cột Giữa kỳ (bài tập) (1 điểm) đã có điểm."),
      );
      await replaceGradeComponents(tx, { ...dropMidterm, confirmDropScores: true });
      assert.equal((await tx.select().from(gradeScores).where(eq(gradeScores.enrollmentId, roster[0].id))).length, 0);

      await tx.insert(gradeScores).values(roster.map((entry) => ({ gradeComponentId: components[1].id, enrollmentId: entry.id, score: 7 })));
      await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      await tx.update(gradeSheets).set({ status: "locked", lockedAt: new Date() }).where(eq(gradeSheets.id, sheet.id));
      assert.equal(
        await messageOf(tx, (inner) =>
          replaceGradeComponents(inner, { gradeSheetId: sheet.id, components: [{ key: "final", label: "Thi cuối kỳ", weight: 100 }], confirmDropScores: false }),
        ),
        GRADES_CONSTRAINT_MESSAGE.grade_components_sheet_locked,
      );
    });
  });
});

describe("grades: tệp Excel bảng điểm", () => {
  const components = [
    { key: "midterm", label: "Giữa kỳ", weight: 40 },
    { key: "final", label: "Cuối kỳ", weight: 60 },
  ];
  const roster = [
    { studentId: "s1", studentCode: "50.01.104.009", fullName: "Phạm Gia Đạt" },
    { studentId: "s2", studentCode: "50.01.104.016", fullName: "Lê Minh Anh" },
  ];

  test("xuất .xlsx đúng mẫu, sửa điểm trong tệp rồi đọc lại được", async () => {
    const buffer = await gradeSheetWorkbook({
      classCode: "COMP1080.01",
      courseName: "Trí tuệ nhân tạo",
      components,
      students: roster,
      scores: { s1: { midterm: 7.5, final: 8 }, s2: { midterm: 6, final: null } },
      locked: false,
      grading: { scale: SCALE, roundingStep: 0.1 },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(buffer).buffer);
    const sheet = workbook.worksheets[0];
    assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["MSSV", "Họ và tên", "Giữa kỳ (40%)", "Cuối kỳ (60%)", "Tổng", "Điểm chữ"]);
    assert.equal(sheet.getCell("C2").numFmt, "0.00");
    assert.equal(sheet.getCell("C2").protection?.locked, false);
    assert.notEqual(sheet.getCell("A2").protection?.locked, false);
    assert.equal((sheet.getCell("E2").value as ExcelJS.CellFormulaValue).result, 7.8);
    assert.equal((sheet.getCell("F2").value as ExcelJS.CellFormulaValue).result, "B");

    sheet.getCell("D3").value = 9.25;
    sheet.getCell("C3").value = "6,5";
    sheet.addRow(["99.99.999.999", "Không có trong lớp", 5, 5]);
    sheet.addRow(["50.01.104.009", "Lặp lại", 1, 1]);
    const edited = await workbook.xlsx.writeBuffer();
    const matrix = await readWorkbookMatrix(edited as ArrayBuffer);
    const { changes, errors } = parseScoreMatrix(matrix, components, roster);
    assert.deepEqual(changes, [
      { studentId: "s1", key: "midterm", score: 7.5 },
      { studentId: "s1", key: "final", score: 8 },
      { studentId: "s2", key: "midterm", score: 6.5 },
      { studentId: "s2", key: "final", score: 9.25 },
    ]);
    assert.deepEqual(errors, ["Dòng 4: MSSV 99.99.999.999 không có trong lớp", "Dòng 5: MSSV 50.01.104.009 lặp lại, chỉ lấy dòng đầu"]);
  });

  test("tệp khác mẫu, điểm ngoài 0–10 báo đúng dòng; CSV dùng cùng cách đọc", () => {
    assert.deepEqual(parseScoreMatrix([["MSSV", "Họ và tên", "Cuối kỳ"]], components, roster).errors, [
      "Tệp không đúng mẫu: dùng tệp xuất từ nút Xuất Excel của chính bảng điểm này.",
    ]);
    const { changes, errors } = parseScoreMatrix(
      [
        ["MSSV", "Họ và tên", "Giữa kỳ (40%)", "Cuối kỳ (60%)"],
        ["5001104009", "Phạm Gia Đạt", "11", ""],
        ["", "", "", ""],
        ["50.01.104.016", "Lê Minh Anh", "abc", "7"],
      ],
      components,
      roster,
    );
    assert.deepEqual(changes, [{ studentId: "s2", key: "final", score: 7 }]);
    assert.deepEqual(errors, ['Dòng 2: Giữa kỳ "11" phải là số từ 0 đến 10', 'Dòng 4: Giữa kỳ "abc" phải là số từ 0 đến 10']);
  });
});

const grade = (score10: number) => ({ score10, ...letterOf(score10, SCALE) });

describe("grades: sinh cảnh báo học vụ", () => {
  test("kế hoạch đồng bộ: thêm mới, cập nhật cảnh báo chưa xử lý, bỏ khi đã đạt, giữ cảnh báo đã xử lý", () => {
    const warning = { level: 2 as const, termGpa4: 1.2, cpa4: 1.3, failedCredits: 3, reasons: ["CPA 1,30 dưới ngưỡng 1,5"] };
    const plan = planWarningSync(
      [
        { ...warning, id: "w1", studentId: "a", status: "new" },
        { ...warning, id: "w2", studentId: "b", status: "new" },
        { ...warning, id: "w3", studentId: "c", status: "notified" },
        { ...warning, id: "w4", studentId: "d", status: "new" },
      ],
      [
        { ...warning, studentId: "a" },
        { ...warning, level: 3 as const, cpa4: 0.9, studentId: "b" },
        { ...warning, level: 3 as const, studentId: "c" },
        { ...warning, studentId: "e" },
      ],
    );
    assert.deepEqual(plan.create.map((entry) => entry.studentId), ["e"]);
    assert.deepEqual(plan.update.map((entry) => [entry.id, entry.level]), [["w2", 3]]);
    assert.deepEqual(plan.remove, ["w4"]);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.handled, 1);
    const termList = [
      { id: "hk2", semester: 2, endDate: "2026-06-27" },
      { id: "he", semester: 3, endDate: "2026-08-15" },
      { id: "hk1", semester: 1, endDate: "2027-01-16" },
    ];
    assert.equal(latestWarningTerm(termList, "2026-10-19")?.id, "hk2");
    assert.equal(latestWarningTerm(termList, "2026-01-01"), null);
  });

  test("chạy hai lần không sinh trùng; điểm đổi thì cập nhật cảnh báo chưa xử lý; cố vấn nhận thông báo cảnh báo mới", async () => {
    await inRollback(async (tx) => {
      const [course] = await tx.select().from(courses).where(eq(courses.code, "COMP1070"));
      const [major] = await tx.select().from(majors).limit(1);
      const [advisor] = await tx.select().from(lecturers).where(sql`${lecturers.userId} IS NOT NULL`).limit(1);
      const [term] = await tx
        .insert(terms)
        .values({ code: "TEST-AW-term", name: "Học kỳ kiểm thử cảnh báo", shortName: "Kiểm thử", academicYear: 2001, semester: 1, startDate: "2001-01-01", endDate: "2001-05-01" })
        .returning();
      const [homeClass] = await tx.insert(administrativeClasses).values({ code: "TEST-AW-class", majorId: major.id, cohort: 97, advisorId: advisor.id }).returning();
      const [weak, strong] = await tx
        .insert(students)
        .values(
          [1, 2].map((index) => ({
            code: `TEST-AW-${index}`,
            fullName: `Sinh viên kiểm thử cảnh báo ${index}`,
            gender: "female" as const,
            dateOfBirth: "2010-01-01",
            email: `test-aw-${index}@student.hcmue.edu.vn`,
            administrativeClassId: homeClass.id,
          })),
        )
        .returning();
      await tx.insert(courseResults).values([
        { studentId: weak.id, courseId: course.id, termId: term.id, source: "legacy", ...grade(2) },
        { studentId: strong.id, courseId: course.id, termId: term.id, source: "legacy", ...grade(9) },
      ]);

      const first = await syncAcademicWarnings(tx, term.id);
      assert.deepEqual([first.students, first.created, first.updated, first.advisorsNotified], [2, 1, 0, 1]);
      const second = await syncAcademicWarnings(tx, term.id);
      assert.deepEqual([second.created, second.updated, second.removed, second.unchanged, second.advisorsNotified], [0, 0, 0, 1, 0]);
      const stored = await tx.select().from(academicWarnings).where(eq(academicWarnings.termId, term.id));
      assert.deepEqual(stored.map((row) => [row.studentId, row.level]), [[weak.id, 3]]);
      const notices = await tx.select({ title: notifications.title }).from(notifications).where(eq(notifications.recipientUserId, advisor.userId!));
      assert.ok(notices.some((notice) => notice.title === "Lớp TEST-AW-class có 1 sinh viên bị cảnh báo học vụ học kỳ kiểm thử cảnh báo"));

      await tx.update(courseResults).set(grade(4.5)).where(eq(courseResults.studentId, weak.id));
      const third = await syncAcademicWarnings(tx, term.id);
      assert.equal(third.updated, 1);
      const [updated] = await tx.select().from(academicWarnings).where(eq(academicWarnings.studentId, weak.id));
      assert.equal(updated.level, 2);

      await tx.update(academicWarnings).set({ status: "notified" }).where(eq(academicWarnings.id, updated.id));
      await tx.update(courseResults).set(grade(2)).where(eq(courseResults.studentId, weak.id));
      const fourth = await syncAcademicWarnings(tx, term.id);
      assert.deepEqual([fourth.updated, fourth.handled], [0, 1]);
      assert.equal(
        await messageOf(tx, (inner) => inner.update(academicWarnings).set({ level: 3 }).where(eq(academicWarnings.id, updated.id))),
        GRADES_CONSTRAINT_MESSAGE.academic_warnings_handled_locked,
      );
    });
  });

  test("học kỳ chưa kết thúc không xét được; dữ liệu mẫu sinh lại không đổi cảnh báo nào", async () => {
    await inRollback(async (tx) => {
      await assert.rejects(
        tx.transaction((inner) => syncAcademicWarnings(inner, mockTermId("hk1-2026"))),
        (error: unknown) => error instanceof GradeActionError && error.message.includes("chưa kết thúc"),
      );
      const result = await syncAcademicWarnings(tx, mockTermId("hk2-2025"), { notify: false });
      assert.ok(result.students > 0 && result.unchanged + result.handled > 0);
      assert.deepEqual([result.created, result.updated, result.removed], [0, 0, 0]);
    });
  });
});

describe("grades: lần học cuối và cảnh báo chính thức trên DB", () => {
  test("xét cảnh báo theo lần học cuối: học lại đạt thì hết nợ, không bị cảnh báo", async () => {
    await inRollback(async (tx) => {
      const pool = await tx.select().from(courses).where(sql`${courses.code} IN ('COMP1070', 'COMP1080', 'COMP1090')`);
      const [major] = await tx.select().from(majors).limit(1);
      const [first, second] = await tx
        .insert(terms)
        .values([
          { code: "TEST-LA-1", name: "Học kỳ kiểm thử lần 1", shortName: "KT1", academicYear: 2001, semester: 1, startDate: "2001-01-01", endDate: "2001-05-01" },
          { code: "TEST-LA-2", name: "Học kỳ kiểm thử lần 2", shortName: "KT2", academicYear: 2001, semester: 2, startDate: "2001-06-01", endDate: "2001-10-01" },
        ])
        .returning();
      const [homeClass] = await tx.insert(administrativeClasses).values({ code: "TEST-LA-class", majorId: major.id, cohort: 96 }).returning();
      const [student] = await tx
        .insert(students)
        .values({ code: "TEST-LA-1", fullName: "Sinh viên kiểm thử học lại", gender: "male", dateOfBirth: "2010-01-01", email: "test-la-1@student.hcmue.edu.vn", administrativeClassId: homeClass.id })
        .returning();
      await tx.insert(courseResults).values([
        ...pool.map((course) => ({ studentId: student.id, courseId: course.id, termId: first.id, source: "legacy" as const, ...grade(2) })),
        ...pool.map((course) => ({ studentId: student.id, courseId: course.id, termId: second.id, source: "legacy" as const, ...grade(8) })),
      ]);
      const afterFirst = await syncAcademicWarnings(tx, first.id, { notify: false });
      assert.equal(afterFirst.created, 1);
      const afterSecond = await syncAcademicWarnings(tx, second.id, { notify: false });
      assert.equal(afterSecond.created, 0);
      const [transcript] = [...(await loadTranscripts(tx, [student.id])).values()];
      const standing = computeStanding(student.id, transcript, RULES);
      assert.deepEqual([standing.failedCredits, standing.earnedCredits, standing.cpa4, standing.retakeCredits], [0, 9, 3.5, 9]);
      const aggregate = (await cumulativeResults(tx)).get(student.id);
      assert.deepEqual(aggregate, { cpa4: 3.5, cpa10: 8, earnedCredits: 9, failedCredits: 0 });
    });
  });

  test("cảnh báo chính thức là cảnh báo đã gửi của học kỳ có cảnh báo đã ban hành gần nhất", async () => {
    await inRollback(async (tx) => {
      const [warning] = await tx.select().from(academicWarnings).where(eq(academicWarnings.termId, mockTermId("hk2-2025"))).limit(1);
      await tx.update(academicWarnings).set({ status: "new" }).where(eq(academicWarnings.id, warning.id));
      assert.equal(await currentWarningLevel(tx, warning.studentId), 0);
      await tx.update(academicWarnings).set({ status: "notified" }).where(eq(academicWarnings.id, warning.id));
      assert.equal(await currentWarningLevel(tx, warning.studentId), warning.level);
      const all = await currentWarnings(tx);
      assert.ok([...all.values()].every((entry) => entry.termId === mockTermId("hk2-2025")));
    });
  });

  test("tổng hợp trong SQL khớp bảng điểm tính bằng hàm thuần với dữ liệu mẫu có học lại, cải thiện", async () => {
    const sample = await db.select({ id: students.id }).from(students).orderBy(students.code).limit(80);
    const ids = sample.map((row) => row.id);
    const [transcripts, aggregates] = await Promise.all([loadTranscripts(db, ids), cumulativeResults(db)]);
    let retaken = 0;
    for (const id of ids) {
      const transcript = transcripts.get(id) ?? [];
      if (transcript.some((term) => term.courses.some((course) => course.replaced))) retaken += 1;
      const standing = computeStanding(id, transcript, RULES);
      const aggregate = aggregates.get(id);
      assert.equal(aggregate?.cpa4 ?? null, standing.cpa4, `CPA của ${id}`);
      assert.equal(aggregate?.earnedCredits ?? 0, standing.earnedCredits);
      assert.equal(aggregate?.failedCredits ?? 0, standing.failedCredits);
    }
    assert.ok(retaken > 0, "dữ liệu mẫu phải có sinh viên học lại hoặc học cải thiện");
  });
});
