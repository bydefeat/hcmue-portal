import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, count, countDistinct, desc, eq, isNotNull, sum } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { mockId, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import { lecturers, students } from "@/modules/users/users.schema";
import { ANNOUNCEMENTS } from "@/modules/announcements/announcements.mock";
import { announcements } from "@/modules/announcements/announcements.schema";
import { AUDIT_LOG } from "@/modules/audit/audit.mock";
import { auditLogs } from "@/modules/audit/audit.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import { NOTIFICATIONS } from "@/modules/notifications/notifications.mock";
import { notifications } from "@/modules/notifications/notifications.schema";
import { CALENDAR_EVENTS, REGULATION, REGULATION_VERSIONS } from "@/modules/settings/settings.mock";
import { calendarEvents, regulations } from "@/modules/settings/settings.schema";
import { invoiceLines, tuitionInvoices } from "@/modules/tuition/tuition.schema";

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

describe("seed khớp dữ liệu mẫu: học phí, thông báo, nhật ký, cấu hình", () => {
  test("thông báo công khai, thông báo cá nhân, nhật ký đủ số dòng và giữ id của mock", async () => {
    const [[announcement], [notification], [log]] = await Promise.all([
      db.select({ total: count() }).from(announcements),
      db.select({ total: count() }).from(notifications),
      db.select({ total: count() }).from(auditLogs),
    ]);
    assert.equal(announcement.total, ANNOUNCEMENTS.length);
    assert.equal(notification.total, NOTIFICATIONS.length);
    assert.equal(log.total, AUDIT_LOG.length);
    const [first] = await db.select().from(announcements).where(eq(announcements.id, ANNOUNCEMENTS[0].id));
    assert.equal(first?.slug, ANNOUNCEMENTS[0].slug);
    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.id, AUDIT_LOG[0].id));
    assert.equal(entry?.summary, AUDIT_LOG[0].summary);
  });

  test("thông báo cá nhân gửi đúng tài khoản seed của từng cổng", async () => {
    const rows = await db.select({ audience: notifications.audience, role: user.role }).from(notifications).innerJoin(user, eq(user.id, notifications.recipientUserId));
    const roleOf = { student: "student", lecturer: "lecturer", administrator: "admin" } as const;
    for (const row of rows) assert.equal(row.role, roleOf[row.audience]);
    const [unread] = await db.select({ total: count() }).from(notifications).where(isNotNull(notifications.readAt));
    assert.equal(unread.total, NOTIFICATIONS.filter((item) => item.isRead).length);
  });

  test("quy chế mới nhất là bản đang dùng của mock, lịch năm học đủ mốc", async () => {
    const [latest] = await db.select().from(regulations).orderBy(desc(regulations.effectiveFrom)).limit(1);
    assert.equal(latest.version, REGULATION.version);
    assert.deepEqual(latest.rules.credits, REGULATION.credits);
    const [[versions], [events]] = await Promise.all([db.select({ total: count() }).from(regulations), db.select({ total: count() }).from(calendarEvents)]);
    assert.equal(versions.total, REGULATION_VERSIONS.length);
    assert.equal(events.total, CALENDAR_EVENTS.length);
  });

  test("học phí học kỳ hiện tại tính đúng số tín chỉ đăng ký trong enrollments", async () => {
    const termId = mockTermId("hk1-2026");
    const [[enrolled], [billed]] = await Promise.all([
      db
        .select({ credits: sum(courses.credits).mapWith(Number) })
        .from(enrollments)
        .innerJoin(courses, eq(courses.id, enrollments.courseId))
        .where(and(eq(enrollments.studentId, CURRENT_STUDENT_ID), eq(enrollments.termId, termId), eq(enrollments.status, "enrolled"))),
      db
        .select({ quantity: invoiceLines.quantity })
        .from(invoiceLines)
        .innerJoin(tuitionInvoices, eq(tuitionInvoices.id, invoiceLines.invoiceId))
        .where(and(eq(tuitionInvoices.studentId, CURRENT_STUDENT_ID), eq(tuitionInvoices.termId, termId), eq(invoiceLines.position, 1))),
    ]);
    assert.ok(enrolled.credits > 0);
    assert.equal(billed?.quantity, enrolled.credits);
    const [invoices] = await db.select({ total: count() }).from(tuitionInvoices).where(eq(tuitionInvoices.termId, termId));
    const [enrolledStudents] = await db
      .select({ total: countDistinct(enrollments.studentId) })
      .from(enrollments)
      .where(and(eq(enrollments.termId, termId), eq(enrollments.status, "enrolled")));
    assert.equal(invoices.total, enrolledStudents.total);
  });
});
