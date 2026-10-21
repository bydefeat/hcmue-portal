import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { createRandom } from "@/shared/libs/mock.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { MIDTERM_SURVEY, MIDTERM_SURVEY_RESULTS, SURVEY, SURVEY_RESULTS, type SurveySeed } from "@/modules/surveys/surveys.mock";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import type { SectionSurveyResult } from "@/modules/surveys/surveys.type";
import { CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

function scoresFor(average: number, n: number, random: () => number) {
  const total = Math.min(5 * n, Math.max(n, Math.round(average * n)));
  const base = Math.floor(total / n);
  const scores = Array.from({ length: n }, (_, index) => Math.min(5, base + (index < total - base * n ? 1 : 0)));
  return scores.map((score) => ({ score, order: random() })).toSorted((a, b) => a.order - b.order).map((entry) => entry.score);
}

type Roster = { sectionId: string; studentId: string }[];

async function seedRound(tx: Transaction, survey: SurveySeed, results: SectionSurveyResult[], roster: Roster, mineSubmitted: Set<string>, seed: number) {
  await tx.insert(surveys).values({
    id: survey.id,
    termId: survey.termId,
    title: survey.title,
    opensAt: new Date(survey.opensAt),
    closesAt: new Date(survey.closesAt),
    sealedAt: survey.isSealed ? new Date(survey.closesAt) : null,
  });
  await tx.insert(surveyQuestions).values(survey.questions.map((question, index) => ({ id: question.id, surveyId: survey.id, position: index + 1, group: question.group, text: question.text })));
  const resultOf = new Map(results.map((result) => [result.classSectionId, result]));
  const sectionIds = [...new Set([...results.map((result) => result.classSectionId), ...mineSubmitted])];
  const submissions: (typeof surveySubmissions.$inferInsert)[] = [];
  const responses: { response: typeof surveyResponses.$inferInsert; answers: (typeof surveyAnswers.$inferInsert)[]; order: number }[] = [];
  const shuffle = createRandom(seed);
  for (const [position, sectionId] of sectionIds.entries()) {
    const random = createRandom(seed + position * 97 + 13);
    const result = resultOf.get(sectionId);
    const members = roster.filter((entry) => entry.sectionId === sectionId).map((entry) => entry.studentId);
    const others = members.filter((id) => id !== CURRENT_STUDENT_ID);
    const meToo = mineSubmitted.has(sectionId);
    const target = Math.min(members.length, Math.max(meToo ? 1 : 0, result?.responses ?? 1));
    const submitters = [...(meToo ? [CURRENT_STUDENT_ID] : []), ...others].slice(0, target);
    const scores = survey.questions.map((question) => scoresFor(result?.averages[question.id] ?? 4, submitters.length, random));
    for (const [index, studentId] of submitters.entries()) {
      submissions.push({ surveyId: survey.id, classSectionId: sectionId, studentId });
      const id = randomUUID();
      const comment = result?.comments[submitters.length - 1 - index] ?? null;
      responses.push({
        response: { id, surveyId: survey.id, classSectionId: sectionId, comment },
        answers: survey.questions.map((question, questionIndex) => ({ responseId: id, questionId: question.id, score: scores[questionIndex][index] })),
        order: shuffle(),
      });
    }
  }
  const shuffled = responses.toSorted((a, b) => a.order - b.order);
  await tx.insert(surveySubmissions).values(submissions);
  await tx.insert(surveyResponses).values(shuffled.map((entry) => entry.response));
  const answers = shuffled.flatMap((entry) => entry.answers);
  for (let start = 0; start < answers.length; start += 1000) await tx.insert(surveyAnswers).values(answers.slice(start, start + 1000));
  return submissions.length;
}

export async function seedSurveys(tx: Transaction, _context: SeedContext) {
  const roster = await tx
    .select({ sectionId: enrollments.classSectionId, studentId: enrollments.studentId })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .where(and(eq(enrollments.termId, SURVEY.termId), eq(enrollments.status, "enrolled"), eq(classSections.status, "open")))
    .orderBy(asc(enrollments.id));
  const mine = [...new Set(roster.filter((entry) => entry.studentId === CURRENT_STUDENT_ID).map((entry) => entry.sectionId))];
  const mineSections = await tx.select({ id: classSections.id, code: classSections.code }).from(classSections).where(inArray(classSections.id, mine));
  const mineSubmitted = new Set(
    mineSections
      .toSorted((a, b) => a.code.localeCompare(b.code))
      .filter((_, index) => index % 3 === 0)
      .map((section) => section.id),
  );
  const current = await seedRound(tx, SURVEY, SURVEY_RESULTS, roster, mineSubmitted, 7);
  const midterm = await seedRound(tx, MIDTERM_SURVEY, MIDTERM_SURVEY_RESULTS, roster, new Set(), 31);
  return { submissions: current + midterm };
}
