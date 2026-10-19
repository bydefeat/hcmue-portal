import "server-only";
import { cache } from "react";
import { and, asc, avg, count, desc, eq, gte, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { MIN_RESPONSES_FOR_LECTURER } from "@/modules/surveys/surveys.constant";
import { summarizeScores } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { lecturers } from "@/modules/users/users.schema";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import type { SectionSurveyResult, StudentSurveyTask, Survey } from "@/modules/surveys/surveys.type";

// Đợt khảo sát giảng dạy của học kỳ hiện tại (đợt mở gần nhất), kèm câu hỏi theo thứ tự trên phiếu.
export const getSurvey = cache(async (): Promise<Survey | null> => {
  await requireSession();
  const [survey] = await db
    .select({ id: surveys.id, termId: surveys.termId, title: surveys.title, opensAt: surveys.opensAt, closesAt: surveys.closesAt })
    .from(surveys)
    .innerJoin(terms, eq(terms.id, surveys.termId))
    .where(eq(terms.isCurrent, true))
    .orderBy(desc(surveys.opensAt))
    .limit(1);
  if (!survey) return null;
  const questions = await db
    .select({ id: surveyQuestions.id, group: surveyQuestions.group, text: surveyQuestions.text })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.surveyId, survey.id))
    .orderBy(asc(surveyQuestions.position));
  return { ...survey, opensAt: survey.opensAt.toISOString(), closesAt: survey.closesAt.toISOString(), questions };
});

const lecturerName = sql<string | null>`CASE WHEN ${lecturers.id} IS NULL THEN NULL ELSE ${lecturers.title} || ' ' || ${lecturers.fullName} END`;

// Kết quả tổng hợp theo lớp từ các phiếu ẩn danh: số phiếu, điểm trung bình từng câu, góp ý. Chỉ lớp có phiếu.
async function sectionResults(survey: Survey, where?: SQL, minResponses = 1): Promise<SectionSurveyResult[]> {
  const tallies = await db
    .select({ sectionId: surveyResponses.classSectionId, responses: count() })
    .from(surveyResponses)
    .innerJoin(classSections, eq(classSections.id, surveyResponses.classSectionId))
    .where(and(eq(surveyResponses.surveyId, survey.id), where))
    .groupBy(surveyResponses.classSectionId)
    .having(gte(count(), minResponses));
  if (tallies.length === 0) return [];
  const sectionIds = tallies.map((row) => row.sectionId);
  const [sections, averages, comments] = await Promise.all([
    db
      .select({
        classSectionId: classSections.id,
        classCode: classSections.code,
        courseName: courses.name,
        lecturerId: classSections.lecturerId,
        lecturerName,
        faculty: faculties.name,
        enrolled: classSections.enrolledCount,
      })
      .from(classSections)
      .innerJoin(courses, eq(courses.id, classSections.courseId))
      .innerJoin(faculties, eq(faculties.id, courses.facultyId))
      .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
      .where(inArray(classSections.id, sectionIds))
      .orderBy(asc(classSections.code)),
    db
      .select({ sectionId: surveyResponses.classSectionId, questionId: surveyAnswers.questionId, average: avg(surveyAnswers.score).mapWith(Number) })
      .from(surveyAnswers)
      .innerJoin(surveyResponses, eq(surveyResponses.id, surveyAnswers.responseId))
      .where(and(eq(surveyResponses.surveyId, survey.id), inArray(surveyResponses.classSectionId, sectionIds)))
      .groupBy(surveyResponses.classSectionId, surveyAnswers.questionId),
    db
      .select({ sectionId: surveyResponses.classSectionId, comment: surveyResponses.comment })
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, survey.id), inArray(surveyResponses.classSectionId, sectionIds), isNotNull(surveyResponses.comment)))
      .orderBy(asc(surveyResponses.id)),
  ]);
  const questionIds = survey.questions.map((question) => question.id);
  const responsesOf = new Map(tallies.map((row) => [row.sectionId, row.responses]));
  return sections.map((section) => {
    const scores = Object.fromEntries(averages.filter((row) => row.sectionId === section.classSectionId).map((row) => [row.questionId, row.average]));
    return {
      ...section,
      responses: responsesOf.get(section.classSectionId) ?? 0,
      ...summarizeScores(questionIds, scores),
      comments: comments.filter((row) => row.sectionId === section.classSectionId).map((row) => row.comment!),
    };
  });
}

// Toàn bộ kết quả cho Phòng Đào tạo và khoa (trang lọc theo phạm vi khoa).
export async function getSurveyResults(): Promise<SectionSurveyResult[]> {
  await requirePermission("surveys.view");
  const survey = await getSurvey();
  return survey ? sectionResults(survey) : [];
}

// Kết quả các lớp của giảng viên đang đăng nhập, chỉ lớp đủ số phiếu tối thiểu.
export async function getSurveyResultsForLecturer(): Promise<SectionSurveyResult[]> {
  const lecturer = await getCurrentLecturer();
  const survey = await getSurvey();
  return survey ? sectionResults(survey, eq(classSections.lecturerId, lecturer.id), MIN_RESPONSES_FOR_LECTURER) : [];
}

// Điểm chung trung bình các lớp của khoa giảng viên (lớp đủ số phiếu), để giảng viên so sánh mà không xem từng lớp.
export async function getFacultySurveyAverage(): Promise<number | null> {
  const lecturer = await getCurrentLecturer();
  const survey = await getSurvey();
  if (!survey) return null;
  const facultyCourses = db
    .select({ id: courses.id })
    .from(courses)
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(faculties.name, lecturer.faculty));
  const results = await sectionResults(survey, inArray(classSections.courseId, facultyCourses), MIN_RESPONSES_FOR_LECTURER);
  return results.length > 0 ? results.reduce((sum, result) => sum + result.overall, 0) / results.length : null;
}

// Lớp sinh viên đang đăng nhập cần đánh giá trong đợt khảo sát và ngày đã gửi (chỉ lưu ngày, không lưu giờ).
export async function getStudentSurveyTasks(surveyId: string): Promise<StudentSurveyTask[]> {
  const student = await getCurrentStudent();
  if (!isUuid(surveyId)) return [];
  const [survey] = await db.select({ termId: surveys.termId }).from(surveys).where(eq(surveys.id, surveyId));
  if (!survey) return [];
  const rows = await db
    .select({
      classSectionId: classSections.id,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerName,
      submittedAt: surveySubmissions.submittedOn,
    })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .innerJoin(courses, eq(courses.id, classSections.courseId))
    .leftJoin(lecturers, eq(lecturers.id, classSections.lecturerId))
    .leftJoin(
      surveySubmissions,
      and(eq(surveySubmissions.surveyId, surveyId), eq(surveySubmissions.classSectionId, classSections.id), eq(surveySubmissions.studentId, student.id)),
    )
    .where(and(eq(enrollments.studentId, student.id), eq(enrollments.termId, survey.termId), eq(enrollments.status, "enrolled"), ne(classSections.status, "cancelled")))
    .orderBy(asc(classSections.code));
  return rows;
}
