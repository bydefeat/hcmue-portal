import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { mockId, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import { lecturers, students } from "@/modules/users/users.schema";
import { REQUESTS } from "@/modules/requests/requests.mock";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";

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

  test("đơn từ: đủ đơn, bước, tệp của dữ liệu mẫu; bộ đếm mã nối tiếp mã lớn nhất", async () => {
    const [requestCount] = await db.select({ total: count() }).from(academicRequests);
    assert.equal(requestCount.total, REQUESTS.length);
    const [stepCount] = await db.select({ total: count() }).from(requestSteps);
    assert.equal(stepCount.total, REQUESTS.reduce((sum, request) => sum + request.steps.length, 0));
    const [fileCount] = await db.select({ total: count() }).from(requestAttachments);
    assert.equal(fileCount.total, REQUESTS.reduce((sum, request) => sum + request.attachments.length, 0));
    const [first] = await db.select().from(academicRequests).where(eq(academicRequests.id, mockId("request:1")));
    assert.equal(first?.code, REQUESTS[0].code);
    assert.equal(first?.requesterStudentId, CURRENT_STUDENT_ID);
    const [counter] = await db.select().from(requestCodeCounters).where(and(eq(requestCodeCounters.prefix, "DT"), eq(requestCodeCounters.year, 2026)));
    const maxCode = Math.max(...REQUESTS.filter((request) => request.code.startsWith("DT-2026-")).map((request) => Number(request.code.slice(-5))));
    assert.equal(counter?.lastValue, maxCode);
  });
});
