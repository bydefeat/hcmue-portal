import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { auditLogs } from "@/modules/audit/audit.schema";
import { CURRICULUM_CONSTRAINT_MESSAGE } from "@/modules/curriculum/curriculum.constant";
import { applyProgramCourseChange, FrameworkError } from "@/modules/curriculum/curriculum.lib";
import {
  applyFrameworkChange,
  COURSE_SCHEMA,
  frameworkChangeError,
  frameworkIssues,
  PROGRAM_COURSE_CHANGE_SCHEMA,
  PROGRAM_SCHEMA,
  programSemesterLimit,
  programStatusChangeError,
} from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses, programCohorts, programCourses, programs } from "@/modules/curriculum/curriculum.schema";
import type { Course, ProgramCourseChange, ProgramDetail } from "@/modules/curriculum/curriculum.type";
import { GRANT_ROLE_SCHEMA, ROLE_PERMISSIONS_SCHEMA } from "@/modules/access/access.rule";

after(() => db.$client.end());

const course = {
  code: " comp2999 ",
  name: "Học phần thử",
  credits: 3,
  theoryCredits: 2,
  practiceCredits: 1,
  faculty: "Khoa Công nghệ Thông tin",
  type: "elective",
  block: "major",
  prerequisiteCodes: ["COMP1020", "COMP1020"],
  corequisiteCodes: [],
  equivalentCodes: [],
  isActive: true,
} as const;

describe("curriculum: kiểm dữ liệu", () => {
  test("mã học phần viết hoa, bỏ khoảng trắng, bỏ tiên quyết trùng", () => {
    const parsed = parseInput(COURSE_SCHEMA, course);
    assert.ok(parsed.ok);
    assert.equal(parsed.data.code, "COMP2999");
    assert.deepEqual(parsed.data.prerequisiteCodes, ["COMP1020"]);
    assert.equal(parsed.data.description, "");
  });

  test("tín chỉ lý thuyết cộng thực hành phải bằng tổng, không tự làm tiên quyết của mình", () => {
    const split = parseInput(COURSE_SCHEMA, { ...course, practiceCredits: 2 });
    assert.ok(!split.ok && split.fieldErrors?.practiceCredits);
    const self = parseInput(COURSE_SCHEMA, { ...course, prerequisiteCodes: ["COMP2999"] });
    assert.ok(!self.ok && self.fieldErrors?.prerequisiteCodes);
  });

  test("chương trình: mã ngành 7 số, ít nhất một khóa, khóa sắp xếp và bỏ trùng", () => {
    const program = { code: "7480201", name: "CNTT", majorCode: "104", degree: "Cử nhân", totalCredits: 130, durationYears: 4, cohorts: [51, 50, 51], status: "draft" } as const;
    const parsed = parseInput(PROGRAM_SCHEMA, program);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.cohorts, [50, 51]);
    const bad = parseInput(PROGRAM_SCHEMA, { ...program, code: "74802", cohorts: [], durationYears: 3.5 });
    assert.ok(!bad.ok);
    assert.deepEqual(Object.keys(bad.fieldErrors ?? {}).toSorted(), ["code", "cohorts", "durationYears"]);
  });
});

describe("curriculum: ràng buộc ở DB", () => {
  test("trùng mã học phần và tách tín chỉ sai trả câu của module", async () => {
    const [first] = await db.select().from(courses).limit(1);
    const duplicate = await db
      .insert(courses)
      .values({ ...first, id: undefined, createdAt: undefined, updatedAt: undefined })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(duplicate, CURRICULUM_CONSTRAINT_MESSAGE), CURRICULUM_CONSTRAINT_MESSAGE.courses_code_unique);
    const split = await db
      .update(courses)
      .set({ practiceCredits: first.practiceCredits + 1 })
      .where(eq(courses.id, first.id))
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(split, CURRICULUM_CONSTRAINT_MESSAGE), CURRICULUM_CONSTRAINT_MESSAGE.courses_credit_split);
    const self = await db
      .insert(courseRelations)
      .values({ courseId: first.id, relatedCourseId: first.id, kind: "prerequisite" })
      .catch((caught: unknown) => caught);
    assert.equal(pgErrorMessage(self, CURRICULUM_CONSTRAINT_MESSAGE), CURRICULUM_CONSTRAINT_MESSAGE.course_relations_not_self);
  });
});

describe("access: kiểm dữ liệu", () => {
  test("quyền phải nằm trong danh sách, ít nhất một quyền", () => {
    const roleId = "0192f3a4-0000-7000-8000-000000000000";
    assert.ok(parseInput(ROLE_PERMISSIONS_SCHEMA, { roleId, permissions: ["students.view", "students.view"] }).ok);
    assert.ok(!parseInput(ROLE_PERMISSIONS_SCHEMA, { roleId, permissions: ["xoa.het"] }).ok);
    assert.ok(!parseInput(ROLE_PERMISSIONS_SCHEMA, { roleId, permissions: [] }).ok);
  });

  test("cấp quyền cần chọn tài khoản và vai trò hợp lệ", () => {
    const missing = parseInput(GRANT_ROLE_SCHEMA, { userId: "", roleId: "" });
    assert.ok(!missing.ok);
    assert.equal(missing.fieldErrors?.userId, "Chưa chọn cán bộ");
  });
});

const program = (semesters: ProgramDetail["semesters"]) => ({
  semesters,
  totalCredits: 6,
  plannedCredits: semesters.reduce((sum, semester) => sum + semester.credits, 0),
});

function catalogCourse(code: string, credits: number, prerequisiteCodes: string[] = [], isActive = true): Course {
  return {
    id: code,
    code,
    name: code,
    credits,
    theoryCredits: credits,
    practiceCredits: 0,
    faculty: "Khoa Công nghệ Thông tin",
    type: "required",
    block: "major",
    prerequisiteCodes,
    corequisiteCodes: [],
    equivalentCodes: [],
    isActive,
    description: "",
  };
}

describe("curriculum: kiểm khung chương trình", () => {
  const catalog = new Map(
    [catalogCourse("COMP1010", 3), catalogCourse("COMP1020", 3, ["COMP1010"]), catalogCourse("COMP0999", 2, [], false)].map((entry) => [entry.code, entry]),
  );
  const plan = [{ courseCode: "COMP1010", semester: 2 }];

  test("học kỳ 1 đến số năm × 2, tối đa 12", () => {
    assert.equal(programSemesterLimit(4), 8);
    assert.equal(programSemesterLimit(8), 12);
  });

  test("không trùng học phần, không thêm học phần ngừng mở, học kỳ trong khung", () => {
    assert.equal(frameworkChangeError(plan, { kind: "add", semester: 3, courseCodes: ["COMP1020"] }, catalog, 8), null);
    assert.equal(frameworkChangeError(plan, { kind: "add", semester: 3, courseCodes: ["COMP1010"] }, catalog, 8), "Học phần COMP1010 đã có trong khung ở học kỳ 2.");
    assert.equal(frameworkChangeError(plan, { kind: "add", semester: 3, courseCodes: ["COMP0999"] }, catalog, 8), "Học phần COMP0999 đã ngừng mở, không thêm vào khung được.");
    assert.equal(frameworkChangeError(plan, { kind: "add", semester: 9, courseCodes: ["COMP1020"] }, catalog, 8), "Khung chương trình này chỉ có học kỳ 1 đến 8.");
    assert.equal(frameworkChangeError(plan, { kind: "move", courseCode: "COMP1010", semester: 2 }, catalog, 8), "Học phần COMP1010 đã ở học kỳ 2.");
    assert.equal(frameworkChangeError(plan, { kind: "remove", courseCode: "COMP1020" }, catalog, 8), "Học phần COMP1020 không còn trong khung, tải lại trang.");
    assert.deepEqual(applyFrameworkChange(plan, { kind: "move", courseCode: "COMP1010", semester: 5 }), [{ courseCode: "COMP1010", semester: 5 }]);
    const parsed = parseInput(PROGRAM_COURSE_CHANGE_SCHEMA, { kind: "add", semester: 0, courseCodes: [] });
    assert.ok(!parsed.ok && parsed.fieldErrors?.semester && parsed.fieldErrors?.courseCodes);
  });

  test("tiên quyết xếp sau, thiếu tiên quyết, lệch tổng tín chỉ chỉ là cảnh báo", () => {
    const first = catalog.get("COMP1010")!;
    const second = catalog.get("COMP1020")!;
    assert.deepEqual(
      frameworkIssues(
        program([
          { semester: 1, credits: 3, courses: [first] },
          { semester: 2, credits: 3, courses: [second] },
        ]),
      ),
      [],
    );
    const sameTerm = frameworkIssues(program([{ semester: 1, credits: 6, courses: [second, first] }]));
    assert.deepEqual(
      sameTerm.map((issue) => issue.kind),
      ["prerequisite-order"],
    );
    const missing = frameworkIssues(program([{ semester: 2, credits: 3, courses: [second] }]));
    assert.deepEqual(
      missing.map((issue) => issue.kind),
      ["prerequisite-missing", "credits-short"],
    );
    assert.equal(missing[1].message, "Khung còn thiếu 3 tín chỉ so với tổng 6 của chương trình.");
  });
});

class Rollback extends Error {}

// Chạy trong một giao dịch rồi hủy, không để lại dữ liệu; mỗi thao tác lỗi chạy trong savepoint riêng.
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

// Chạy trong savepoint, ép kiểm ràng buộc hoãn ngay rồi so câu báo lỗi (null là không lỗi).
async function failureOrNull(tx: Transaction, run: (inner: Transaction) => Promise<unknown>, expected: string | null) {
  const error = await tx
    .transaction(async (inner) => {
      await run(inner);
      await inner.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      throw new Rollback();
    })
    .then(() => null)
    .catch((caught: unknown) => (caught instanceof Rollback ? null : caught));
  assert.equal(error === null ? null : pgErrorMessage(error, CURRICULUM_CONSTRAINT_MESSAGE), expected);
}

async function failureOf(tx: Transaction, run: (inner: Transaction) => Promise<unknown>) {
  const error = await tx
    .transaction(async (inner) => {
      await run(inner);
    })
    .then(() => null)
    .catch((caught: unknown) => caught);
  assert.ok(error, "thao tác phải bị chặn");
  return error instanceof FrameworkError ? error.message : pgErrorMessage(error, CURRICULUM_CONSTRAINT_MESSAGE);
}

const actor = { userId: null, name: "Kiểm thử", role: "Kiểm thử" };

describe("curriculum: sửa khung chương trình trên DB", () => {
  test("thêm, chuyển, bỏ học phần trong chương trình nháp, ghi nhật ký; DB chặn học kỳ vượt thời gian đào tạo", async () => {
    await inRollback(async (tx) => {
      const [draft] = await tx.select().from(programs).where(eq(programs.name, "Công nghệ thông tin (cập nhật 2027)"));
      const run = (inner: Transaction, change: ProgramCourseChange, faculty: string | null = null) =>
        applyProgramCourseChange(inner, { programId: draft.id, change, actor, faculty });
      await run(tx, { kind: "add", semester: 1, courseCodes: ["COMP1010", "COMP1013"] });
      await run(tx, { kind: "move", courseCode: "COMP1013", semester: 2 });
      await run(tx, { kind: "remove", courseCode: "COMP1010" });
      const rows = await tx
        .select({ code: courses.code, semester: programCourses.semester })
        .from(programCourses)
        .innerJoin(courses, eq(courses.id, programCourses.courseId))
        .where(eq(programCourses.programId, draft.id));
      assert.deepEqual(rows, [{ code: "COMP1013", semester: 2 }]);
      const logs = await tx
        .select({ summary: auditLogs.summary })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, "program"), eq(auditLogs.entityId, draft.id)))
        .orderBy(auditLogs.at, auditLogs.id);
      assert.deepEqual(
        logs.map((log) => log.summary),
        ["Thêm COMP1010, COMP1013 vào học kỳ 1", "Chuyển COMP1013 từ học kỳ 1 sang học kỳ 2", "Bỏ COMP1010 khỏi khung (học kỳ 1)"],
      );
      assert.equal(await failureOf(tx, (inner) => run(inner, { kind: "add", semester: 3, courseCodes: ["COMP1013"] })), "Học phần COMP1013 đã có trong khung ở học kỳ 2.");
      assert.equal(await failureOf(tx, (inner) => run(inner, { kind: "add", semester: 3, courseCodes: ["COMP0999"] })), "Học phần COMP0999 đã ngừng mở, không thêm vào khung được.");
      assert.equal(await failureOf(tx, (inner) => run(inner, { kind: "move", courseCode: "COMP1013", semester: 9 })), "Khung chương trình này chỉ có học kỳ 1 đến 8.");
      assert.equal(
        await failureOf(tx, (inner) => run(inner, { kind: "add", semester: 3, courseCodes: ["COMP1020"] }, "Khoa Toán - Tin học")),
        "Chương trình thuộc khoa khác, bạn chỉ sửa được khung của khoa mình.",
      );
      const [extra] = await tx.select().from(courses).where(eq(courses.code, "COMP1020"));
      assert.equal(
        await failureOf(tx, (inner) => inner.insert(programCourses).values({ programId: draft.id, courseId: extra.id, semester: 9 })),
        CURRICULUM_CONSTRAINT_MESSAGE.program_courses_semester_within_duration,
      );
      await run(tx, { kind: "move", courseCode: "COMP1013", semester: 5 });
      assert.equal(
        await failureOf(tx, (inner) => inner.update(programs).set({ durationYears: 2 }).where(eq(programs.id, draft.id))),
        CURRICULUM_CONSTRAINT_MESSAGE.program_courses_semester_within_duration,
      );
    });
  });

  test("chương trình ngừng áp dụng chỉ xem được, kể cả ghi thẳng vào DB", async () => {
    await inRollback(async (tx) => {
      const [archived] = await tx.select().from(programs).where(eq(programs.status, "archived")).limit(1);
      const [first] = await tx.select().from(courses).where(eq(courses.code, "COMP1010"));
      assert.equal(
        await failureOf(tx, (inner) =>
          applyProgramCourseChange(inner, { programId: archived.id, change: { kind: "add", semester: 1, courseCodes: ["COMP1010"] }, actor, faculty: null }),
        ),
        "Chương trình đã ngừng áp dụng nên khung chỉ xem được.",
      );
      assert.equal(
        await failureOf(tx, (inner) => inner.insert(programCourses).values({ programId: archived.id, courseId: first.id, semester: 1 })),
        CURRICULUM_CONSTRAINT_MESSAGE.program_courses_program_archived,
      );
      // Ngừng áp dụng là trạng thái cuối: không mở lại được.
      assert.equal(
        await failureOf(tx, (inner) => inner.update(programs).set({ status: "draft" }).where(eq(programs.id, archived.id))),
        CURRICULUM_CONSTRAINT_MESSAGE.programs_archived_final,
      );
      const [draft] = await tx.select().from(programs).where(eq(programs.name, "Công nghệ thông tin (cập nhật 2027)"));
      await tx.insert(programCourses).values({ programId: draft.id, courseId: first.id, semester: 1 });
      await tx.update(programs).set({ status: "archived" }).where(eq(programs.id, draft.id));
      assert.equal(
        await failureOf(tx, (inner) => inner.delete(programCourses).where(eq(programCourses.programId, draft.id))),
        CURRICULUM_CONSTRAINT_MESSAGE.program_courses_program_archived,
      );
    });
  });

  test("mỗi ngành, khóa chỉ một chương trình đang áp dụng (kiểm lúc commit); quy tắc chuyển trạng thái", async () => {
    assert.equal(programStatusChangeError("archived", "active"), "Chương trình đã ngừng áp dụng, không mở lại được. Tạo chương trình mới nếu cần áp dụng lại.");
    assert.equal(programStatusChangeError("draft", "active"), null);
    await inRollback(async (tx) => {
      const [draft] = await tx.select().from(programs).where(eq(programs.name, "Công nghệ thông tin (cập nhật 2027)"));
      // Khóa 52 chưa có chương trình nào đang áp dụng: kích hoạt được.
      await failureOrNull(tx, (inner) => inner.update(programs).set({ status: "active" }).where(eq(programs.id, draft.id)), null);
      await failureOrNull(
        tx,
        async (inner) => {
          await inner.update(programs).set({ status: "active" }).where(eq(programs.id, draft.id));
          await inner.insert(programCohorts).values({ programId: draft.id, cohort: 50 });
        },
        CURRICULUM_CONSTRAINT_MESSAGE.programs_single_active_cohort!,
      );
    });
  });

  test("khung mẫu của mỗi chương trình đang áp dụng đủ tổng tín chỉ của chương trình", async () => {
    const rows = await db
      .select({ name: programs.name, totalCredits: programs.totalCredits, planned: sql<number>`coalesce(sum(${courses.credits}), 0)::int` })
      .from(programs)
      .leftJoin(programCourses, eq(programCourses.programId, programs.id))
      .leftJoin(courses, eq(courses.id, programCourses.courseId))
      .where(eq(programs.status, "active"))
      .groupBy(programs.id);
    assert.equal(rows.length, 6);
    for (const row of rows) assert.equal(row.planned, row.totalCredits, row.name);
  });
});
