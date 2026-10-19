import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { dayjs } from "@/shared/libs/date.lib";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, majors } from "@/modules/curriculum/curriculum.schema";
import { GRADES_CONSTRAINT_MESSAGE, toLetter, toStanding, weightedScore } from "@/modules/grades/grades.constant";
import ExcelJS from "exceljs";
import { gradeSheetWorkbook, readWorkbookMatrix } from "@/modules/grades/grades.excel";
import { GradeActionError, replaceGradeComponents, syncAcademicWarnings } from "@/modules/grades/grades.lib";
import {
  buildTranscript,
  componentKey,
  computeStanding,
  creditAverage,
  GRADE_COMPONENTS_SAVE_SCHEMA,
  GRADE_SCORES_SAVE_SCHEMA,
  GRADE_SHEET_RETURN_SCHEMA,
  latestWarningTerm,
  parseScoreMatrix,
  planComponentChanges,
  planWarningSync,
  sheetState,
  summarizeStandings,
  warningLevelOf,
  warningReasons,
} from "@/modules/grades/grades.rule";
import { academicWarnings, courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import type { LetterGrade, TranscriptCourse } from "@/modules/grades/grades.type";
import { notifications } from "@/modules/notifications/notifications.schema";
import { mockTermId } from "@/shared/libs/mock.lib";
import { administrativeClasses, lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

function graded(code: string, credits: number, score10: number | null): TranscriptCourse {
  if (score10 === null) return { courseCode: code, courseName: code, credits, score10: null, letter: null, point4: null };
  const step = toLetter(score10);
  return { courseCode: code, courseName: code, credits, score10, letter: step.letter as LetterGrade, point4: step.point4 };
}

describe("grades: quy đổi điểm", () => {
  test("điểm chữ và thang 4 đúng ở các mốc", () => {
    assert.deepEqual([8.5, 8.4, 8, 7, 6.5, 5.5, 5, 4, 3.9, 0].map((score) => toLetter(score).letter), ["A", "B+", "B+", "B", "C+", "C", "D+", "D", "F", "F"]);
    assert.equal(toLetter(6.9).point4, 2.5);
  });

  test("điểm tổng kết theo trọng số, làm tròn 1 chữ số; thiếu một cột thì chưa có điểm", () => {
    const components = [
      { key: "attendance", label: "Chuyên cần", weight: 10 },
      { key: "midterm", label: "Giữa kỳ", weight: 30 },
      { key: "final", label: "Cuối kỳ", weight: 60 },
    ];
    assert.equal(weightedScore(components, { attendance: 10, midterm: 7.25, final: 6.5 }), 7.1);
    assert.equal(weightedScore(components, { attendance: 10, midterm: 7, final: null }), null);
  });

  test("xếp loại theo CPA", () => {
    assert.deepEqual([3.6, 3.59, 3.2, 2.5, 2, 1.99, 1, 0.5].map(toStanding), ["excellent", "very-good", "very-good", "good", "average", "weak", "weak", "poor"]);
  });
});

describe("grades: GPA, CPA, cảnh báo học vụ", () => {
  const sample = [
    { termId: "t1", termName: "HK1", isInProgress: false, courses: [graded("A", 3, 9), graded("B", 2, 6), graded("C", 3, 3)] },
    { termId: "t2", termName: "HK2", isInProgress: false, courses: [graded("C", 3, 7), graded("D", 4, 8.5)] },
    { termId: "t3", termName: "HK3", isInProgress: true, courses: [graded("E", 3, null), graded("F", 2, 9)] },
  ];
  const transcript = buildTranscript(sample);

  test("GPA kỳ có trọng số tín chỉ, CPA tính mọi lần học, kỳ đang học không có CPA", () => {
    // HK1: (4*3 + 2*2 + 0*3) / 8 = 2,00; HK2: (3*3 + 4*4) / 7 = 3,57; tích lũy: (16 + 25) / 15 = 2,73.
    assert.equal(transcript[0].gpa4, 2);
    assert.equal(transcript[0].gpa10, 6);
    assert.equal(transcript[1].gpa4, 3.57);
    assert.equal(transcript[1].cpa4, 2.73);
    assert.equal(transcript[0].earnedCredits, 5);
    assert.equal(transcript[0].attemptedCredits, 8);
    assert.equal(transcript[2].cpa4, null);
    assert.equal(transcript[2].earnedCredits, 0);
    assert.equal(transcript[2].gpa4, 4);
  });

  test("xếp loại và nợ tín chỉ chỉ tính các kỳ đã kết thúc", () => {
    const standing = computeStanding("sv", transcript);
    assert.equal(standing.cpa4, 2.73);
    assert.equal(standing.earnedCredits, 12);
    assert.equal(standing.failedCredits, 3);
    assert.equal(standing.lastTermGpa4, 3.57);
    assert.equal(standing.standing, "good");
    assert.equal(standing.warningLevel, 0);
  });

  test("không có điểm thì trung bình trống, xếp loại kém nhưng không cảnh báo", () => {
    assert.equal(creditAverage([], "point4"), null);
    const standing = computeStanding("sv", []);
    assert.equal(standing.cpa4, 0);
    assert.equal(standing.warningLevel, 0);
  });

  test("ngưỡng cảnh báo: mức 3 CPA dưới 1, mức 2 CPA dưới 1,5 hoặc nợ 12 tín chỉ, mức 1 ĐTB kỳ dưới 1 hoặc nợ 6 tín chỉ", () => {
    const base = { hasCourses: true, cpa4: 2.5, failedCredits: 0, lastTermGpa4: 2.5 };
    assert.equal(warningLevelOf({ ...base, cpa4: 0.99 }), 3);
    assert.equal(warningLevelOf({ ...base, cpa4: 1.49 }), 2);
    assert.equal(warningLevelOf({ ...base, failedCredits: 12 }), 2);
    assert.equal(warningLevelOf({ ...base, failedCredits: 6 }), 1);
    assert.equal(warningLevelOf({ ...base, lastTermGpa4: 0.9 }), 1);
    assert.equal(warningLevelOf({ ...base, failedCredits: 5 }), 0);
    assert.equal(warningLevelOf({ ...base, cpa4: 0, hasCourses: false }), 0);
    assert.deepEqual(warningReasons({ cpa4: 1.2, lastTermGpa4: 0.5, failedCredits: 9 }), ["CPA 1,20 dưới ngưỡng 1,5", "ĐTB học kỳ gần nhất 0,50", "Nợ 9 tín chỉ"]);
  });

  test("tổng hợp xếp loại theo khoa", () => {
    const standing = computeStanding("sv", transcript);
    const [summary] = summarizeStandings([
      { faculty: "Khoa A", standing },
      { faculty: "Khoa A", standing: { ...standing, cpa4: 1.25, standing: "weak", warningLevel: 2 } },
    ]);
    assert.equal(summary.total, 2);
    assert.equal(summary.averageCpa, 1.99);
    assert.equal(summary.counts.good, 1);
    assert.equal(summary.warnings, 1);
  });

  test("trạng thái bảng điểm suy từ hạn nhập", () => {
    const now = dayjs("2026-10-19T10:00:00Z");
    assert.equal(sheetState("draft", "2026-10-18T16:59:00Z", now), "overdue");
    assert.equal(sheetState("draft", "2026-10-22T16:59:00Z", now), "due-soon");
    assert.equal(sheetState("draft", "2026-11-30T16:59:00Z", now), "in-progress");
    assert.equal(sheetState("locked", "2026-10-18T16:59:00Z", now), "locked");
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

// Chạy trong một giao dịch rồi hủy, không để lại dữ liệu; mỗi lệnh lỗi chạy trong savepoint riêng.
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
      // Khoa trả lại thì giảng viên sửa được tiếp.
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
      // SET CONSTRAINTS giữ tới hết giao dịch ngoài, trả lại kiểm lúc commit cho các bước sau.
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

const grade = (score10: number) => ({ score10, letter: toLetter(score10).letter, point4: toLetter(score10).point4 });

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

      // Đã gửi thông báo thì sinh lại không đổi mức; ghi thẳng vào DB cũng bị chặn.
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
