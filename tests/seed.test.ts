import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { mockId, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { GRADE_SHEET_SEEDS, mockTranscriptTerms, mockWarningMeta } from "@/modules/grades/grades.mock";
import { academicWarnings, courseResults, gradeSheets } from "@/modules/grades/grades.schema";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID, STUDENTS } from "@/modules/users/users.mock";
import { lecturers, students } from "@/modules/users/users.schema";

after(() => db.$client.end());

// Seed phải ghi đúng id của dữ liệu mẫu: module còn đọc mock tham chiếu sinh viên, lớp, học kỳ theo các id này.
describe("seed khớp dữ liệu mẫu", () => {
  test("id tất định của học kỳ, lớp học phần, sinh viên có trong DB", async () => {
    const [term] = await db.select().from(terms).where(eq(terms.id, mockTermId("hk1-2026")));
    assert.equal(term?.isCurrent, true);
    const [section] = await db.select().from(classSections).where(eq(classSections.id, mockSectionId("hk1-2026", "COMP1020.01")));
    assert.equal(section?.code, "COMP1020.01");
    const [student] = await db.select().from(students).where(eq(students.id, mockId("student:12")));
    assert.ok(student);
  });

  test("sĩ số mỗi lớp bằng số đăng ký đang hiệu lực và bằng dữ liệu mẫu", async () => {
    const rows = await db
      .select({ id: enrollments.classSectionId, total: count() })
      .from(enrollments)
      .where(eq(enrollments.status, "enrolled"))
      .groupBy(enrollments.classSectionId);
    const totalOf = new Map(rows.map((row) => [row.id, row.total]));
    const sections = await db.select({ id: classSections.id, enrolled: classSections.enrolledCount }).from(classSections);
    for (const section of sections) assert.equal(section.enrolled, totalOf.get(section.id) ?? 0);
    const mockEnrolled = new Map(CLASS_SECTIONS.map((entry) => [entry.id, entry.status === "open" ? entry.enrolled : 0]));
    for (const section of sections) assert.equal(section.enrolled, mockEnrolled.get(section.id));
  });

  test("tài khoản seed gắn đúng hồ sơ sinh viên, giảng viên hiện tại của dữ liệu mẫu", async () => {
    const [studentAccount] = await db.select({ id: students.id }).from(students).innerJoin(user, eq(user.id, students.userId));
    assert.equal(studentAccount.id, CURRENT_STUDENT_ID);
    const [lecturerAccount] = await db.select({ id: lecturers.id }).from(lecturers).where(isNotNull(lecturers.userId));
    assert.equal(lecturerAccount.id, CURRENT_LECTURER_ID);
    const [{ total }] = await db.select({ total: count() }).from(user).where(and(eq(user.role, "student"), isNotNull(user.username)));
    assert.equal(total, 1);
  });
});

describe("seed grades, graduation khớp dữ liệu mẫu", () => {
  test("mỗi học phần đã học trong bảng điểm mẫu là một dòng course_results, cùng điểm và học kỳ", async () => {
    const past = STUDENTS.flatMap((student, index) => mockTranscriptTerms(index).filter((term) => !term.isInProgress).map((term) => ({ student, term })));
    const [{ total }] = await db.select({ total: count() }).from(courseResults).where(eq(courseResults.source, "legacy"));
    assert.equal(total, past.reduce((sum, { term }) => sum + term.courses.length, 0));
    const index = STUDENTS.findIndex((student) => student.id === CURRENT_STUDENT_ID);
    const [first] = mockTranscriptTerms(index);
    const rows = await db
      .select({ code: courses.code, score10: courseResults.score10, letter: courseResults.letter, termId: courseResults.termId })
      .from(courseResults)
      .innerJoin(courses, eq(courses.id, courseResults.courseId))
      .where(and(eq(courseResults.studentId, CURRENT_STUDENT_ID), eq(courseResults.termId, first.termId)));
    assert.deepEqual(
      rows.map((row) => `${row.code}:${row.score10}:${row.letter}`).toSorted(),
      first.courses.map((course) => `${course.courseCode}:${course.score10}:${course.letter}`).toSorted(),
    );
  });

  test("bảng điểm lớp học phần kỳ hiện tại đúng trạng thái mẫu, lớp đã công bố có kết quả cho cả lớp", async () => {
    const sheets = await db.select({ classSectionId: gradeSheets.classSectionId, status: gradeSheets.status }).from(gradeSheets);
    const statusOf = new Map(sheets.map((sheet) => [sheet.classSectionId, sheet.status]));
    for (const [sectionId, seed] of Object.entries(GRADE_SHEET_SEEDS)) assert.equal(statusOf.get(sectionId), seed.status);
    const sectionId = mockSectionId("hk1-2026", "MATH1011.01");
    const [{ enrolled }] = await db.select({ enrolled: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, sectionId));
    const [{ total }] = await db
      .select({ total: count() })
      .from(courseResults)
      .innerJoin(enrollments, eq(enrollments.id, courseResults.enrollmentId))
      .where(eq(enrollments.classSectionId, sectionId));
    assert.equal(total, enrolled);
  });

  test("cảnh báo học vụ giữ id mẫu; hồ sơ tốt nghiệp đủ cho khóa 48", async () => {
    const warnings = await db.select({ id: academicWarnings.id }).from(academicWarnings);
    const ids = new Set(warnings.map((row) => row.id));
    assert.ok(warnings.length > 0);
    assert.ok(STUDENTS.some((_, index) => ids.has(mockWarningMeta(index).id)));
    const [{ total }] = await db.select({ total: count() }).from(graduationRecords);
    assert.equal(total, STUDENTS.filter((student) => student.cohort === 48).length);
  });
});
