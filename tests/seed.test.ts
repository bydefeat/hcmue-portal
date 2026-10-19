import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, count, countDistinct, desc, eq, isNotNull, sql, sum } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { mockId, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import { examProctors, examSessions } from "@/modules/exams/exams.schema";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { SURVEY, SURVEY_RESULTS } from "@/modules/surveys/surveys.mock";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { GRADE_SHEET_SEEDS, mockTranscriptTerms, mockWarningMeta } from "@/modules/grades/grades.mock";
import { academicWarnings, courseResults, gradeSheets } from "@/modules/grades/grades.schema";
import { graduationRecords } from "@/modules/graduation/graduation.schema";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID, STUDENTS } from "@/modules/users/users.mock";
import { lecturers, students } from "@/modules/users/users.schema";
import { REQUESTS } from "@/modules/requests/requests.mock";
import { academicRequests, requestAttachments, requestCodeCounters, requestSteps } from "@/modules/requests/requests.schema";
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
import { APPOINTMENTS, MEETING_NOTES } from "@/modules/advising/advising.mock";
import { advisingAppointments, advisingNotes, appointmentStudents } from "@/modules/advising/advising.schema";
import { STUDY_PLANS } from "@/modules/study-plan/study-plan.mock";
import { studyPlanItems, studyPlans } from "@/modules/study-plan/study-plan.schema";
import { CLASS_ANNOUNCEMENTS, SYLLABI } from "@/modules/teaching/teaching.mock";
import { classAnnouncementReads, classAnnouncements, syllabi, syllabusAssessments, syllabusWeeks } from "@/modules/teaching/teaching.schema";
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

  test("đơn từ: đủ đơn, bước, tệp của dữ liệu mẫu; bộ đếm mã nối tiếp mã lớn nhất", async () => {
    const [requestCount] = await db.select({ total: count() }).from(academicRequests);
    assert.equal(requestCount.total, REQUESTS.length);
    const [stepCount] = await db.select({ total: count() }).from(requestSteps);
    assert.equal(stepCount.total, REQUESTS.reduce((acc, request) => acc + request.steps.length, 0));
    const [fileCount] = await db.select({ total: count() }).from(requestAttachments);
    assert.equal(fileCount.total, REQUESTS.reduce((acc, request) => acc + request.attachments.length, 0));
    const [first] = await db.select().from(academicRequests).where(eq(academicRequests.id, mockId("request:1")));
    assert.equal(first?.code, REQUESTS[0].code);
    assert.equal(first?.requesterStudentId, CURRENT_STUDENT_ID);
    const [counter] = await db.select().from(requestCodeCounters).where(and(eq(requestCodeCounters.prefix, "DT"), eq(requestCodeCounters.year, 2026)));
    const maxCode = Math.max(...REQUESTS.filter((request) => request.code.startsWith("DT-2026-")).map((request) => Number(request.code.slice(-5))));
    assert.equal(counter?.lastValue, maxCode);
  });
});

describe("seed khớp dữ liệu mẫu: lịch học, lịch thi, khảo sát", () => {
  test("mọi lớp đang mở có buổi học; buổi đã điểm danh có đủ bản ghi của sinh viên trong buổi", async () => {
    const [{ sections }] = await db.select({ sections: countDistinct(classSessions.classSectionId) }).from(classSessions);
    const [{ open }] = await db.select({ open: count() }).from(classSections).where(eq(classSections.status, "open"));
    assert.equal(sections, open);
    const mismatched = await db.execute(sql`
      SELECT s.id FROM class_sessions s
      WHERE s.taken_at IS NOT NULL AND (
        SELECT count(*) FROM enrollments e
        WHERE e.class_section_id = s.class_section_id AND e.status = 'enrolled' AND (s.lab_group_id IS NULL OR e.lab_group_id = s.lab_group_id)
      ) <> (SELECT count(*) FROM attendance_records r WHERE r.class_session_id = s.id)`);
    assert.equal(mismatched.length, 0);
    const [{ records }] = await db.select({ records: count() }).from(attendanceRecords);
    assert.ok(records > 0);
  });

  test("ca thi và cán bộ coi thi đúng id của dữ liệu mẫu", async () => {
    const [{ total }] = await db.select({ total: count() }).from(examSessions);
    assert.equal(total, EXAM_SESSIONS.length);
    const [first] = EXAM_SESSIONS;
    const [exam] = await db.select().from(examSessions).where(eq(examSessions.id, first.id));
    assert.equal(exam?.classSectionId, first.classSectionId);
    assert.equal(exam?.kind, first.kind);
    const [{ proctors }] = await db.select({ proctors: count() }).from(examProctors);
    assert.equal(proctors, EXAM_SESSIONS.reduce((acc, entry) => acc + entry.proctors.length, 0));
  });

  test("khảo sát: đúng id phiếu và câu hỏi, số phiếu bằng số người nộp, điểm trung bình khớp mẫu", async () => {
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, SURVEY.id));
    assert.equal(survey?.title, SURVEY.title);
    const questions = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, SURVEY.id));
    assert.deepEqual(questions.map((row) => row.id).toSorted(), SURVEY.questions.map((question) => question.id).toSorted());
    const [{ submissions }] = await db.select({ submissions: count() }).from(surveySubmissions);
    const [{ responses }] = await db.select({ responses: count() }).from(surveyResponses);
    assert.equal(submissions, responses);
    const [{ answers }] = await db.select({ answers: count() }).from(surveyAnswers);
    assert.equal(answers, responses * SURVEY.questions.length);

    const sample = SURVEY_RESULTS[0];
    const [{ total }] = await db.select({ total: count() }).from(surveyResponses).where(eq(surveyResponses.classSectionId, sample.classSectionId));
    const [section] = await db.select({ enrolled: classSections.enrolledCount }).from(classSections).where(eq(classSections.id, sample.classSectionId));
    assert.equal(total, Math.min(sample.responses, section.enrolled));
    const [{ average }] = await db
      .select({ average: sql<number>`avg(${surveyAnswers.score})::float` })
      .from(surveyAnswers)
      .innerJoin(surveyResponses, eq(surveyResponses.id, surveyAnswers.responseId))
      .where(and(eq(surveyResponses.classSectionId, sample.classSectionId), eq(surveyAnswers.questionId, SURVEY.questions[0].id)));
    assert.ok(Math.abs(average - sample.averages[SURVEY.questions[0].id]) <= 0.5 / total + 1e-9);
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

describe("seed grades, graduation khớp dữ liệu mẫu", () => {
  test("mỗi học phần đã học trong bảng điểm mẫu là một dòng course_results, cùng điểm và học kỳ", async () => {
    const past = STUDENTS.flatMap((student, index) => mockTranscriptTerms(index).filter((term) => !term.isInProgress).map((term) => ({ student, term })));
    const [{ total }] = await db.select({ total: count() }).from(courseResults).where(eq(courseResults.source, "legacy"));
    assert.equal(total, past.reduce((acc, { term }) => acc + term.courses.length, 0));
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

const total = async (table: PgTable) => (await db.select({ total: count() }).from(table))[0].total;

describe("seed khớp dữ liệu mẫu: giảng dạy, kế hoạch học tập, cố vấn", () => {
  test("đề cương, thông báo lớp và lượt đã đọc", async () => {
    assert.equal(await total(syllabi), SYLLABI.length);
    assert.equal(await total(syllabusWeeks), SYLLABI.reduce((acc, syllabus) => acc + syllabus.weeks.length, 0));
    assert.equal(await total(syllabusAssessments), SYLLABI.reduce((acc, syllabus) => acc + syllabus.assessments.length, 0));
    const [draft] = await db.select({ status: syllabi.status }).from(syllabi).where(eq(syllabi.classSectionId, mockSectionId("hk1-2026", "COMP1080.01")));
    assert.equal(draft?.status, "draft");
    assert.equal(await total(classAnnouncements), CLASS_ANNOUNCEMENTS.length);
    const [first] = await db.select({ title: classAnnouncements.title }).from(classAnnouncements).where(eq(classAnnouncements.id, mockId("class-announcement:tbl-01")));
    assert.equal(first?.title, CLASS_ANNOUNCEMENTS[0].title);
    assert.equal(await total(classAnnouncementReads), CLASS_ANNOUNCEMENTS.reduce((acc, announcement) => acc + announcement.readCount, 0));
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
    assert.equal(await total(appointmentStudents), APPOINTMENTS.reduce((acc, appointment) => acc + appointment.students.length, 0));
    assert.equal(await total(advisingNotes), MEETING_NOTES.length);
    const [appointment] = await db.select({ advisorId: advisingAppointments.advisorId }).from(advisingAppointments).where(eq(advisingAppointments.id, mockId("appointment:lh-03")));
    assert.equal(appointment?.advisorId, CURRENT_LECTURER_ID);
  });
});
