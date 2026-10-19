import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { newId } from "@/shared/libs/id.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { REGISTRATION_CONSTRAINT_MESSAGE } from "@/modules/course-registration/course-registration.constant";
import { classSections, enrollments, labGroups, registrationHolds, reservedSeats, terms } from "@/modules/course-registration/course-registration.schema";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { courseRelations, courses, majors } from "@/modules/curriculum/curriculum.schema";
import { rooms } from "@/modules/facilities/facilities.schema";
import { courseResults, gradeComponents, gradeScores, gradeSheets } from "@/modules/grades/grades.schema";
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

function enroll(studentId: string, section: { id: string; termId: string; courseId: string }, extra: { labGroupId?: string; reservedSeatId?: string } = {}) {
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
    await db.delete(surveys).where(eq(surveys.termId, ids.termId));
    await db.delete(classSessions).where(inArray(classSessions.classSectionId, ids.sectionIds));
    await db.delete(registrationHolds).where(inArray(registrationHolds.studentId, ids.studentIds));
    await db.delete(courseResults).where(inArray(courseResults.studentId, ids.studentIds));
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
    assert.deepEqual(rows.map((row) => row.code).toSorted(), ["COMP1031", "COMP1040"]);
  });
});

describe("ràng buộc chéo bảng", () => {
  test("không đăng ký vào lớp đã hủy", async () => {
    const section = await makeSection(10, 20, ids.coursePool[3]);
    await db.update(classSections).set({ status: "cancelled" }).where(eq(classSections.id, section.id));
    await rejects(enroll(ids.studentIds[0], section), /không đăng ký được/);
  });

  test("lớp có nhóm thực hành thì phải chọn nhóm", async () => {
    const section = await makeSection(10, 21, ids.coursePool[4]);
    await db.insert(labGroups).values({ classSectionId: section.id, code: `${PREFIX}TH21`, dayOfWeek: 3, startPeriod: 1, endPeriod: 3, roomId: ids.roomId, capacity: 5 });
    await rejects(enroll(ids.studentIds[0], section), /phải chọn một nhóm/);
  });

  test("chỗ dành riêng phải thuộc đúng lớp, tổng chỗ dành riêng không vượt sĩ số", async () => {
    const sectionA = await makeSection(10, 22, ids.coursePool[5]);
    const sectionB = await makeSection(10, 23, ids.coursePool[5]);
    const [seat] = await db.insert(reservedSeats).values({ classSectionId: sectionA.id, label: "Khóa 99", seats: 6 }).returning();
    await rejects(enroll(ids.studentIds[1], sectionB, { reservedSeatId: seat.id }), /enrollments_reserved_seat_fk/);
    await rejects(
      db.transaction((tx) => tx.insert(reservedSeats).values({ classSectionId: sectionA.id, label: "Khóa 98", seats: 5 })),
      /vượt sĩ số lớp/,
    );
    await rejects(
      db.transaction((tx) => tx.update(classSections).set({ capacity: 5 }).where(eq(classSections.id, sectionA.id))),
      /vượt sĩ số lớp/,
    );
  });

  test("điểm và điểm danh chỉ cho sinh viên của chính lớp đó", async () => {
    const sectionA = await makeSection(10, 24, ids.otherCourseId);
    const sectionB = await makeSection(10, 25, ids.coursePool[0]);
    const [outsider] = await enroll(ids.studentIds[1], sectionB);
    const [sheet] = await db.insert(gradeSheets).values({ classSectionId: sectionA.id, deadline: new Date("2030-05-10") }).returning();
    const [component] = await db.insert(gradeComponents).values({ gradeSheetId: sheet.id, key: "final", label: "Cuối kỳ", weight: 100, position: 1 }).returning();
    await rejects(db.insert(gradeScores).values({ gradeComponentId: component.id, enrollmentId: outsider.id, score: 8 }), /không thuộc lớp của bảng điểm/);
    const [session] = await db.insert(classSessions).values({ classSectionId: sectionA.id, date: "2030-01-07", startPeriod: 1, endPeriod: 3, roomId: ids.roomId }).returning();
    await rejects(db.insert(attendanceRecords).values({ classSessionId: session.id, enrollmentId: outsider.id, status: "present" }), /không thuộc lớp của buổi học/);
  });

  test("chỉ sinh viên đang học lớp mới nộp khảo sát lớp đó", async () => {
    const section = await makeSection(10, 26, ids.coursePool[1]);
    const [survey] = await db.insert(surveys).values({ termId: ids.termId, title: "Khảo sát kiểm thử", opensAt: new Date("2030-04-01"), closesAt: new Date("2030-04-20") }).returning();
    await rejects(db.insert(surveySubmissions).values({ surveyId: survey.id, classSectionId: section.id, studentId: ids.studentIds[2] }), /Chỉ sinh viên đang học lớp/);
    await enroll(ids.studentIds[2], section);
    await db.insert(surveySubmissions).values({ surveyId: survey.id, classSectionId: section.id, studentId: ids.studentIds[2] });
  });

  test("kết quả học phần phải khớp sinh viên, học phần, học kỳ của đăng ký", async () => {
    const section = await makeSection(10, 27, ids.coursePool[3]);
    const [row] = await enroll(ids.studentIds[1], section);
    await rejects(
      db.insert(courseResults).values({ studentId: ids.studentIds[2], courseId: section.courseId, termId: section.termId, enrollmentId: row.id }),
      /course_results_enrollment_fk/,
    );
  });

  test("học kỳ không chồng thời gian, gỡ khóa không trước lúc khóa", async () => {
    await rejects(
      db.insert(terms).values({ code: `${PREFIX}overlap`, name: "Chồng", shortName: "Chồng", academicYear: 2030, semester: 2, startDate: "2030-04-01", endDate: "2030-08-01" }),
      /terms_no_overlap/,
    );
    await rejects(
      db.insert(registrationHolds).values({
        studentId: ids.studentIds[0],
        kind: "documents",
        blocking: false,
        reason: "Thiếu hồ sơ",
        resolveHint: "Nộp bổ sung",
        createdByLabel: "Phòng Đào tạo",
        createdAt: new Date("2030-02-01"),
        releasedAt: new Date("2030-01-01"),
        releasedByLabel: "Phòng Đào tạo",
      }),
      /registration_holds_release_after_create/,
    );
  });
});

describe("khóa chính UUID v7", () => {
  test("mọi khóa chính uuid một cột mặc định uuidv7(), không cột nào dùng UUID ngẫu nhiên", async () => {
    const rows = await db.execute<{ table_name: string; column_default: string | null }>(sql`
      SELECT c.table_name, c.column_default
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
      JOIN information_schema.columns c ON c.table_schema = k.table_schema AND c.table_name = k.table_name AND c.column_name = k.column_name
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY' AND c.data_type = 'uuid'
        AND (SELECT count(*) FROM information_schema.key_column_usage x WHERE x.constraint_name = tc.constraint_name AND x.table_schema = tc.table_schema) = 1
    `);
    assert.ok(rows.length >= 50);
    assert.deepEqual(rows.filter((row) => row.column_default !== "uuidv7()").map((row) => row.table_name), []);
    const random = await db.execute(sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_default ILIKE '%random_uuid%'`);
    assert.equal(random.length, 0);
  });

  test("id sinh ra là phiên bản 7 và tăng dần, ở cả DB lẫn newId()", async () => {
    const [first] = await db.execute<{ id: string }>(sql`SELECT uuidv7()::text AS id`);
    const [second] = await db.execute<{ id: string }>(sql`SELECT uuidv7()::text AS id`);
    const app = [newId(), newId(), newId()];
    for (const id of [first.id, second.id, ...app]) assert.equal(id[14], "7");
    assert.ok(first.id < second.id);
    assert.deepEqual([...app].toSorted(), app);
  });
});
