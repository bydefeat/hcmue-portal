import "server-only";
import { cache } from "react";
import { and, asc, avg, count, desc, eq, inArray, isNotNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requireSession } from "@/modules/authentication/authentication.query";
import { requirePermission } from "@/modules/access/access.query";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { courses, faculties } from "@/modules/curriculum/curriculum.schema";
import { MIN_RESPONSES_FOR_LECTURER } from "@/modules/surveys/surveys.constant";
import { sealedSurveyIdsForLecturer } from "@/modules/surveys/surveys.lib";
import { pickSurvey, summarizeScores } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { lecturers } from "@/modules/users/users.schema";
import { getCurrentLecturer, getCurrentStudent } from "@/modules/users/users.query";
import type { SectionSurveyResult, StudentSurveyTask, Survey } from "@/modules/surveys/surveys.type";

const SURVEY_COLUMNS = {
  id: surveys.id,
  termId: surveys.termId,
  termName: terms.name,
  title: surveys.title,
  opensAt: surveys.opensAt,
  closesAt: surveys.closesAt,
  status: sql<Survey["status"]>`CASE WHEN now() < ${surveys.opensAt} THEN 'upcoming' WHEN now() < ${surveys.closesAt} THEN 'open' ELSE 'closed' END`,
  sealedAt: surveys.sealedAt,
  remindedAt: surveys.remindedAt,
};

async function surveyRows(where: SQL | undefined, limit?: number): Promise<Survey[]> {
  const query = db.select(SURVEY_COLUMNS).from(surveys).innerJoin(terms, eq(terms.id, surveys.termId)).where(where).orderBy(desc(surveys.opensAt));
  const rows = limit ? await query.limit(limit) : await query;
  if (rows.length === 0) return [];
  const questions = await db
    .select({ surveyId: surveyQuestions.surveyId, id: surveyQuestions.id, group: surveyQuestions.group, text: surveyQuestions.text })
    .from(surveyQuestions)
    .where(
      inArray(
        surveyQuestions.surveyId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(surveyQuestions.position));
  return rows.map(({ sealedAt, remindedAt, opensAt, closesAt, ...row }) => ({
    ...row,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    isSealed: sealedAt !== null,
    remindedAt: remindedAt?.toISOString() ?? null,
    questions: questions.filter((question) => question.surveyId === row.id).map(({ surveyId: _surveyId, ...question }) => question),
  }));
}

export const getSurvey = cache(async (): Promise<Survey | null> => {
  await requireSession();
  const [survey] = await surveyRows(and(eq(terms.isCurrent, true), lte(surveys.opensAt, sql`now()`)), 1);
  return survey ?? null;
});

export async function getSurveys(): Promise<Survey[]> {
  await requirePermission("surveys.view");
  return surveyRows(undefined);
}

const lecturerName = sql<string | null>`CASE WHEN ${lecturers.id} IS NULL THEN NULL ELSE ${lecturers.title} || ' ' || ${lecturers.fullName} END`;

async function sectionResults(survey: Survey, where?: SQL, minResponses = 0): Promise<SectionSurveyResult[]> {
  const sections = await db
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
    .where(and(eq(classSections.termId, survey.termId), ne(classSections.status, "cancelled"), sql`${classSections.enrolledCount} > 0`, where))
    .orderBy(asc(classSections.code));
  if (sections.length === 0) return [];
  const sectionIds = sections.map((section) => section.classSectionId);
  const [tallies, averages, comments] = await Promise.all([
    db
      .select({ sectionId: surveyResponses.classSectionId, responses: count() })
      .from(surveyResponses)
      .where(and(eq(surveyResponses.surveyId, survey.id), inArray(surveyResponses.classSectionId, sectionIds)))
      .groupBy(surveyResponses.classSectionId),
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
  return sections
    .map((section) => {
      const scores = Object.fromEntries(averages.filter((row) => row.sectionId === section.classSectionId).map((row) => [row.questionId, row.average]));
      return {
        ...section,
        responses: responsesOf.get(section.classSectionId) ?? 0,
        ...summarizeScores(questionIds, scores),
        comments: comments.filter((row) => row.sectionId === section.classSectionId).map((row) => row.comment!),
      };
    })
    .filter((row) => row.responses >= minResponses);
}

export async function getSurveyResults(surveyId: string): Promise<SectionSurveyResult[]> {
  await requirePermission("surveys.view");
  if (!isUuid(surveyId)) return [];
  const [survey] = await surveyRows(eq(surveys.id, surveyId), 1);
  return survey ? sectionResults(survey) : [];
}

const sealedSurveysFor = cache(async (lecturerId: string): Promise<Survey[]> => {
  const ids = await sealedSurveyIdsForLecturer(db, lecturerId);
  return ids.length > 0 ? surveyRows(inArray(surveys.id, ids)) : [];
});

const lecturerSurveyOf = cache(async (lecturerId: string, surveyId: string | undefined) => pickSurvey(await sealedSurveysFor(lecturerId), surveyId));

export async function getLecturerSurveys() {
  const lecturer = await getCurrentLecturer();
  return sealedSurveysFor(lecturer.id);
}

export async function getLecturerSurvey(surveyId?: string) {
  const lecturer = await getCurrentLecturer();
  return lecturerSurveyOf(lecturer.id, surveyId);
}

export async function getSurveyResultsForLecturer(surveyId?: string): Promise<SectionSurveyResult[]> {
  const lecturer = await getCurrentLecturer();
  const survey = await lecturerSurveyOf(lecturer.id, surveyId);
  return survey ? sectionResults(survey, eq(classSections.lecturerId, lecturer.id), MIN_RESPONSES_FOR_LECTURER) : [];
}

export async function getFacultySurveyAverage(surveyId?: string): Promise<number | null> {
  const lecturer = await getCurrentLecturer();
  const survey = await lecturerSurveyOf(lecturer.id, surveyId);
  if (!survey) return null;
  const facultyCourses = db
    .select({ id: courses.id })
    .from(courses)
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(faculties.name, lecturer.faculty));
  const results = await sectionResults(survey, inArray(classSections.courseId, facultyCourses), MIN_RESPONSES_FOR_LECTURER);
  return results.length > 0 ? results.reduce((sum, result) => sum + result.overall, 0) / results.length : null;
}

export async function getStudentSurveyTasks(surveyId: string): Promise<StudentSurveyTask[]> {
  const student = await getCurrentStudent();
  if (!isUuid(surveyId)) return [];
  const [survey] = await db.select({ termId: surveys.termId }).from(surveys).where(eq(surveys.id, surveyId));
  if (!survey) return [];
  return db
    .select({
      classSectionId: classSections.id,
      classCode: classSections.code,
      courseName: courses.name,
      lecturerName,
      isSubmitted: sql<boolean>`${surveySubmissions.studentId} IS NOT NULL`,
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
}
