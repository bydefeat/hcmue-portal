import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { CURRICULUM_CONSTRAINT_MESSAGE } from "@/modules/curriculum/curriculum.constant";
import { COURSE_SCHEMA, PROGRAM_SCHEMA } from "@/modules/curriculum/curriculum.rule";
import { courseRelations, courses } from "@/modules/curriculum/curriculum.schema";
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
