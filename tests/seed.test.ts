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
import { APPOINTMENTS, MEETING_NOTES } from "@/modules/advising/advising.mock";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import { STUDY_PLANS } from "@/modules/study-plan/study-plan.mock";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import { CLASS_ANNOUNCEMENTS, SYLLABI } from "@/modules/teaching/teaching.mock";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusWeeks } from "@/modules/teaching/teaching.schema";
import { courses } from "@/modules/curriculum/curriculum.schema";
import type { PgTable } from "drizzle-orm/pg-core";

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

const total = async (table: PgTable) => (await db.select({ total: count() }).from(table))[0].total;

describe("seed khớp dữ liệu mẫu: giảng dạy, kế hoạch học tập, cố vấn", () => {
  test("đề cương, thông báo lớp và lượt đã đọc", async () => {
    assert.equal(await total(syllabi), SYLLABI.length);
    assert.equal(await total(syllabusWeeks), SYLLABI.reduce((sum, syllabus) => sum + syllabus.weeks.length, 0));
    assert.equal(await total(syllabusAssessments), SYLLABI.reduce((sum, syllabus) => sum + syllabus.assessments.length, 0));
    const [draft] = await db.select({ status: syllabi.status }).from(syllabi).where(eq(syllabi.classSectionId, mockSectionId("hk1-2026", "COMP1080.01")));
    assert.equal(draft?.status, "draft");
    assert.equal(await total(classAnnouncements), CLASS_ANNOUNCEMENTS.length);
    const [first] = await db.select({ title: classAnnouncements.title }).from(classAnnouncements).where(eq(classAnnouncements.id, mockId("class-announcement:tbl-01")));
    assert.equal(first?.title, CLASS_ANNOUNCEMENTS[0].title);
    assert.equal(await total(classAnnouncementReads), CLASS_ANNOUNCEMENTS.reduce((sum, announcement) => sum + announcement.readCount, 0));
  });

  test("kế hoạch học tập theo khung chương trình", async () => {
    assert.equal(await total(studyPlans), STUDY_PLANS.length);
    const [current] = await db.select({ status: studyPlans.status }).from(studyPlans).where(eq(studyPlans.id, mockId("study-plan:12")));
    assert.equal(current?.status, STUDY_PLANS.find((plan) => plan.studentId === CURRENT_STUDENT_ID)?.status);
    // Sinh viên khóa 50 đang học học kỳ 5 của chương trình CNTT 2023: kế hoạch lấy học kỳ 6, 7, 8 (bỏ học phần đã ngừng mở).
    const items = await db
      .select({ code: courses.code, academicYear: studyPlanItems.academicYear, semester: studyPlanItems.semester })
      .from(studyPlanItems)
      .innerJoin(courses, eq(courses.id, studyPlanItems.courseId))
      .where(eq(studyPlanItems.studyPlanId, mockId("study-plan:12")))
      .orderBy(courses.code);
    assert.deepEqual(
      items.map((item) => `${item.code}@${item.academicYear}.${item.semester}`),
      ["COMP1130@2026.2", "COMP4900@2027.1", "COMP4990@2027.2", "EDUC1002@2026.2"],
    );
  });

  test("lịch hẹn, sinh viên được mời, ghi chú cố vấn", async () => {
    assert.equal(await total(advisingAppointments), APPOINTMENTS.length);
    assert.equal(await total(appointmentStudents), APPOINTMENTS.reduce((sum, appointment) => sum + appointment.students.length, 0));
    assert.equal(await total(advisingNotes), MEETING_NOTES.length);
    const [appointment] = await db.select({ advisorId: advisingAppointments.advisorId }).from(advisingAppointments).where(eq(advisingAppointments.id, mockId("appointment:lh-03")));
    assert.equal(appointment?.advisorId, CURRENT_LECTURER_ID);
  });
});
