import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import { classSections, enrollments, labGroups, terms } from "@/modules/course-registration/course-registration.schema";
import { courseRelations, courses, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
import { administrativeClasses, students } from "@/modules/users/users.schema";

type Ids = { termId: string; courseId: string; otherCourseId: string; coursePool: string[]; roomId: string; classId: string; studentIds: string[]; sectionIds: string[] };
const ids = {} as Ids;
const PREFIX = "TEST-";

async function makeSection(capacity: number, sectionNumber: number, courseId = ids.courseId) {
  const [row] = await db
    .insert(classSections)
    .values({
      termId: ids.termId,
      courseId,
      sectionNumber,
      code: `${PREFIX}${sectionNumber}`,
      capacity,
      status: "open",
      startDate: "2030-01-01",
      endDate: "2030-05-01",
    })
    .returning();
  ids.sectionIds.push(row.id);
  return row;
}

function enroll(studentId: string, section: { id: string; termId: string; courseId: string }, extra: { labGroupId?: string } = {}) {
  return db.insert(enrollments).values({ studentId, classSectionId: section.id, termId: section.termId, courseId: section.courseId, ...extra }).returning();
}

async function enrolledCount(sectionId: string) {
  const [row] = await db.select({ count: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, sectionId));
  return row.count;
}

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (error: Error & { cause?: Error }) => {
    const message = `${error.message} ${error.cause?.message ?? ""}`;
    assert.match(message, pattern);
    return true;
  });
}

before(async () => {
  const [course] = await db.select().from(courses).where(eq(courses.code, "COMP1070"));
  const [otherCourse] = await db.select().from(courses).where(eq(courses.code, "COMP1080"));
  const pool = await db.select({ id: courses.id }).from(courses).where(inArray(courses.code, ["COMP1010", "COMP1013", "COMP1020", "COMP1031", "COMP1040", "COMP1050"]));
  const [room] = await db.select().from(rooms).limit(1);
  const [major] = await db.select().from(majors).limit(1);
  const [term] = await db
    .insert(terms)
    .values({ code: `${PREFIX}term`, name: "Học kỳ kiểm thử", shortName: "Kiểm thử", academicYear: 2030, semester: 1, startDate: "2030-01-01", endDate: "2030-05-01" })
    .returning();
  const [homeClass] = await db.insert(administrativeClasses).values({ code: `${PREFIX}class`, majorId: major.id, cohort: 99 }).returning();
  const studentRows = await db
    .insert(students)
    .values(
      [1, 2, 3].map((index) => ({
        code: `${PREFIX}${index}`,
        fullName: `Sinh viên kiểm thử ${index}`,
        gender: "female" as const,
        dateOfBirth: "2008-01-01",
        email: `test-${index}@student.hcmue.edu.vn`,
        administrativeClassId: homeClass.id,
      })),
    )
    .returning();
  Object.assign(ids, {
    termId: term.id,
    courseId: course.id,
    otherCourseId: otherCourse.id,
    coursePool: pool.map((row) => row.id),
    roomId: room.id,
    classId: homeClass.id,
    studentIds: studentRows.map((row) => row.id),
    sectionIds: [],
  });
});

after(async () => {
  if (ids.sectionIds.length) {
    await db.delete(gradeSheets).where(inArray(gradeSheets.classSectionId, ids.sectionIds));
    await db.delete(enrollments).where(inArray(enrollments.classSectionId, ids.sectionIds));
    await db.delete(classSections).where(inArray(classSections.id, ids.sectionIds));
  }
  await db.delete(students).where(inArray(students.id, ids.studentIds));
  await db.delete(administrativeClasses).where(eq(administrativeClasses.id, ids.classId));
  await db.delete(terms).where(eq(terms.id, ids.termId));
  await db.$client.end();
});

describe("đăng ký học phần", () => {
  test("sĩ số tự tăng khi đăng ký và giảm khi hủy", async () => {
    const section = await makeSection(10, 1);
    const [row] = await enroll(ids.studentIds[0], section);
    assert.equal(await enrolledCount(section.id), 1);
    await db.update(enrollments).set({ status: "dropped", droppedAt: new Date() }).where(eq(enrollments.id, row.id));
    assert.equal(await enrolledCount(section.id), 0);
  });

  test("hai sinh viên tranh chỗ cuối cùng: chỉ một người được", async () => {
    const section = await makeSection(1, 2);
    const results = await Promise.allSettled(
      ids.studentIds.slice(0, 2).map((studentId) => db.transaction((tx) => tx.insert(enrollments).values({ studentId, classSectionId: section.id, termId: section.termId, courseId: section.courseId }))),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const loser = results.find((result) => result.status === "rejected");
    assert.match(pgErrorMessage(loser?.reason, REGISTRATION_CONSTRAINT_MESSAGE), /^Lớp đã đủ chỗ/);
    assert.equal(await enrolledCount(section.id), 1);
  });

  test("không đăng ký trùng một lớp, nhưng được đăng ký lại sau khi hủy", async () => {
    const section = await makeSection(10, 3, ids.coursePool[0]);
    const [first] = await enroll(ids.studentIds[0], section);
    await rejects(enroll(ids.studentIds[0], section), /enrollments_active_per_section/);
    await db.update(enrollments).set({ status: "dropped", droppedAt: new Date() }).where(eq(enrollments.id, first.id));
    await enroll(ids.studentIds[0], section);
    assert.equal(await enrolledCount(section.id), 1);
  });

  test("không học hai lớp của cùng một học phần trong một học kỳ", async () => {
    const sectionA = await makeSection(10, 4, ids.coursePool[2]);
    const sectionB = await makeSection(10, 5, ids.coursePool[2]);
    await enroll(ids.studentIds[1], sectionA);
    await rejects(enroll(ids.studentIds[1], sectionB), /enrollments_active_per_course_term/);
  });

  test("học kỳ và học phần trên đăng ký phải khớp với lớp", async () => {
    const section = await makeSection(10, 6);
    await rejects(
      db.insert(enrollments).values({ studentId: ids.studentIds[2], classSectionId: section.id, termId: section.termId, courseId: ids.otherCourseId }),
      /enrollments_class_section_fk/,
    );
  });

  test("nhóm thực hành phải thuộc đúng lớp", async () => {
    const sectionA = await makeSection(10, 7, ids.otherCourseId);
    const sectionB = await makeSection(10, 8);
    const [group] = await db
      .insert(labGroups)
      .values({ classSectionId: sectionA.id, code: `${PREFIX}TH1`, dayOfWeek: 2, startPeriod: 1, endPeriod: 3, roomId: ids.roomId, capacity: 1 })
      .returning();
    await rejects(enroll(ids.studentIds[2], sectionB, { labGroupId: group.id }), /enrollments_lab_group_fk/);
    await enroll(ids.studentIds[2], sectionA, { labGroupId: group.id });
    await rejects(enroll(ids.studentIds[0], sectionA, { labGroupId: group.id }), /lab_groups_enrolled_within_capacity/);
  });

  test("tiết học ngoài 1..12 bị từ chối", async () => {
    const section = await makeSection(10, 9);
    await rejects(
      db.insert(labGroups).values({ classSectionId: section.id, code: `${PREFIX}TH9`, dayOfWeek: 2, startPeriod: 11, endPeriod: 13, roomId: ids.roomId, capacity: 5 }),
      /lab_groups_period_range/,
    );
  });

  test("chỉ một học kỳ được đánh dấu hiện tại", async () => {
    await rejects(db.update(terms).set({ isCurrent: true }).where(eq(terms.id, ids.termId)), /terms_single_current/);
  });
});

describe("điểm", () => {
  test("tổng trọng số thành phần điểm phải bằng 100 khi commit", async () => {
    const section = await makeSection(10, 10);
    const [sheet] = await db.insert(gradeSheets).values({ classSectionId: section.id, deadline: new Date("2030-05-10") }).returning();
    await rejects(
      db.transaction((tx) =>
        tx.insert(gradeComponents).values([
          { gradeSheetId: sheet.id, key: "midterm", label: "Giữa kỳ", weight: 30, position: 1 },
          { gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 60, position: 2 },
        ]),
      ),
      /phải bằng 100/,
    );
    await db.transaction((tx) =>
      tx.insert(gradeComponents).values([
        { gradeSheetId: sheet.id, key: "midterm", label: "Giữa kỳ", weight: 40, position: 1 },
        { gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 60, position: 2 },
      ]),
    );
    const components = await db.select().from(gradeComponents).where(eq(gradeComponents.gradeSheetId, sheet.id));
    assert.equal(components.length, 2);
  });

  test("điểm ngoài 0..10 bị từ chối", async () => {
    const section = await makeSection(10, 11, ids.coursePool[1]);
    const [row] = await enroll(ids.studentIds[0], section);
    const [sheet] = await db.insert(gradeSheets).values({ classSectionId: section.id, deadline: new Date("2030-05-10") }).returning();
    const [component] = await db
      .insert(gradeComponents)
      .values({ gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 100, position: 1 })
      .returning();
    await rejects(db.insert(gradeScores).values({ gradeComponentId: component.id, enrollmentId: row.id, score: 10.5 }), /grade_scores_range/);
  });
});

describe("chương trình đào tạo", () => {
  test("học phần không thể là tiên quyết của chính nó", async () => {
    await rejects(db.insert(courseRelations).values({ courseId: ids.courseId, relatedCourseId: ids.courseId, kind: "prerequisite" }), /course_relations_not_self/);
  });

  test("dữ liệu seed: tiên quyết của Phát triển ứng dụng web", async () => {
    const rows = await db
      .select({ code: courses.code })
      .from(courseRelations)
      .innerJoin(courses, eq(courses.id, courseRelations.relatedCourseId))
      .where(and(eq(courseRelations.courseId, ids.courseId), eq(courseRelations.kind, "prerequisite")));
    assert.deepEqual(rows.map((row) => row.code).sort(), ["COMP1031", "COMP1040"]);
  });
});
