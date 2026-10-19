import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, count, countDistinct, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { mockId, mockSectionId, mockTermId } from "@/shared/libs/mock.lib";
import { user } from "@/modules/authentication/authentication.schema";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { CLASS_SECTIONS } from "@/modules/course-registration/course-registration.mock";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import { EXAM_SESSIONS } from "@/modules/exams/exams.mock";
import { examProctors, examSessions } from "@/modules/exams/exams.schema";
import { attendanceRecords, classSessions } from "@/modules/schedule/schedule.schema";
import { SURVEY, SURVEY_RESULTS } from "@/modules/surveys/surveys.mock";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
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
    assert.equal(proctors, EXAM_SESSIONS.reduce((sum, entry) => sum + entry.proctors.length, 0));
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
