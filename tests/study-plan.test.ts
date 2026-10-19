import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { STUDY_PLAN_CONSTRAINT_MESSAGE } from "@/modules/study-plan/study-plan.constant";
import { parseTermName, planEditMode, STUDY_PLAN_REVIEW_SCHEMA, STUDY_PLAN_SCHEMA, termNameOf, termsOutOfRange } from "@/modules/study-plan/study-plan.rule";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";

after(() => db.$client.end());

describe("study-plan: tên học kỳ", () => {
  test("đổi qua lại giữa (năm học, học kỳ) và tên hiển thị", () => {
    assert.equal(termNameOf({ academicYear: 2026, semester: 2 }), "Học kỳ 2, năm học 2026-2027");
    assert.equal(termNameOf({ academicYear: 2026, semester: 3 }), "Học kỳ hè, năm học 2026-2027");
    assert.deepEqual(parseTermName("Học kỳ 1, năm học 2027-2028"), { academicYear: 2027, semester: 1 });
    assert.deepEqual(parseTermName("Học kỳ hè, năm học 2025-2026"), { academicYear: 2025, semester: 3 });
    assert.equal(parseTermName("Học kỳ 1, năm học 2027-2029"), null);
    assert.equal(parseTermName("HK1 2027"), null);
  });
});

describe("study-plan: kiểm dữ liệu kế hoạch", () => {
  const plan = {
    terms: [
      { termName: "Học kỳ 1, năm học 2027-2028", courseCodes: ["COMP4900"] },
      { termName: "Học kỳ 2, năm học 2026-2027", courseCodes: ["COMP1130", "EDUC1002"] },
    ],
    studentNote: "  Em xin học vượt  ",
  };

  test("cột sắp theo thời gian, ghi chú cắt khoảng trắng", () => {
    const parsed = parseInput(STUDY_PLAN_SCHEMA, plan);
    assert.ok(parsed.ok);
    assert.deepEqual(
      parsed.data.terms.map((term) => [term.academicYear, term.semester]),
      [
        [2026, 2],
        [2027, 1],
      ],
    );
    assert.equal(parsed.data.studentNote, "Em xin học vượt");
  });

  test("một học phần ở hai học kỳ, hai cột trùng học kỳ, tên học kỳ lạ đều bị chặn", () => {
    const twice = parseInput(STUDY_PLAN_SCHEMA, { ...plan, terms: [plan.terms[0], { ...plan.terms[1], courseCodes: ["COMP4900"] }] });
    assert.equal(!twice.ok && twice.fieldErrors?.terms, "Học phần COMP4900 xếp ở nhiều học kỳ");
    const sameTerm = parseInput(STUDY_PLAN_SCHEMA, { ...plan, terms: [plan.terms[0], { ...plan.terms[0], courseCodes: [] }] });
    assert.equal(!sameTerm.ok && sameTerm.fieldErrors?.terms, "Hai cột trùng học kỳ");
    const strange = parseInput(STUDY_PLAN_SCHEMA, { ...plan, terms: [{ termName: "Kỳ sau", courseCodes: [] }] });
    assert.equal(!strange.ok && strange.fieldErrors?.["terms.0.termName"], "Tên học kỳ không hợp lệ");
  });

  test("trả lại phải có nhận xét, duyệt thì không bắt buộc", () => {
    const id = "01940000-0000-7000-8000-000000000000";
    const returned = parseInput(STUDY_PLAN_REVIEW_SCHEMA, { id, decision: "returned", comment: "  " });
    assert.equal(!returned.ok && returned.fieldErrors?.comment, "Chưa nhập nhận xét, sinh viên cần biết lý do để sửa");
    assert.ok(parseInput(STUDY_PLAN_REVIEW_SCHEMA, { id, decision: "approved" }).ok);
  });

  test("quy trình: nháp, bị trả lại thì sửa; đã duyệt thì sửa thành bản mới; chờ duyệt thì khóa", () => {
    assert.equal(planEditMode(null), "create");
    assert.equal(planEditMode("draft"), "update");
    assert.equal(planEditMode("returned"), "update");
    assert.equal(planEditMode("approved"), "new-version");
    assert.equal(planEditMode("pending"), "locked");
  });

  test("học kỳ ngoài hạn mức tín chỉ", () => {
    const terms = [
      { termName: "A", credits: 13 },
      { termName: "B", credits: 14 },
      { termName: "C", credits: 26 },
    ];
    assert.deepEqual(
      termsOutOfRange(terms, { min: 14, max: 25 }).map((term) => term.termName),
      ["A", "C"],
    );
  });
});

describe("study-plan: ràng buộc ở DB", () => {
  test("mỗi sinh viên một kế hoạch đang dùng", async () => {
    const [plan] = await db.select().from(studyPlans).limit(1);
    const error = await db
      .insert(studyPlans)
      .values({ studentId: plan.studentId })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(error, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plans_single_active);
  });

  test("trả lại không nhận xét, chờ duyệt thiếu thời điểm gửi, duyệt thiếu thời điểm xét bị chặn", async () => {
    const [plan] = await db
      .select()
      .from(studyPlans)
      .where(and(eq(studyPlans.status, "pending"), eq(studyPlans.isActive, true)))
      .limit(1);
    const returned = await db
      .update(studyPlans)
      .set({ status: "returned", reviewedAt: new Date(), advisorComment: null })
      .where(eq(studyPlans.id, plan.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(returned, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plans_return_comment);
    const submitted = await db
      .update(studyPlans)
      .set({ submittedAt: null })
      .where(eq(studyPlans.id, plan.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(submitted, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plans_submitted_fields);
    const approved = await db
      .update(studyPlans)
      .set({ status: "approved" })
      .where(eq(studyPlans.id, plan.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(approved, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plans_reviewed_fields);
  });

  test("một học phần chỉ một lần trong kế hoạch, học kỳ từ 1 đến 3", async () => {
    const [item] = await db.select().from(studyPlanItems).limit(1);
    const duplicate = await db
      .insert(studyPlanItems)
      .values({ ...item, semester: item.semester === 1 ? 2 : 1 })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plan_items_study_plan_id_course_id_pk);
    const [other] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, "COMP1010"));
    const semester = await db
      .insert(studyPlanItems)
      .values({ studyPlanId: item.studyPlanId, courseId: other.id, academicYear: 2027, semester: 4 })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(semester, STUDY_PLAN_CONSTRAINT_MESSAGE), STUDY_PLAN_CONSTRAINT_MESSAGE.study_plan_items_semester_range);
  });
});
