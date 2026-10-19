import { and, asc, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/shared/libs/db.lib";
import { dayjs } from "@/shared/libs/date.lib";
import { createRandom } from "@/shared/libs/mock.lib";
import { classSections, enrollments } from "@/modules/course-registration/course-registration.schema";
import { SURVEY, SURVEY_RESULTS } from "@/modules/surveys/surveys.mock";
import { anonymousResponseId } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import type { SeedContext } from "./context";

// Điểm từng phiếu sao cho trung bình của n phiếu bằng đúng điểm mẫu (làm tròn tới 1/n), xáo thứ tự cho tự nhiên.
function scoresFor(average: number, n: number, random: () => number) {
  const total = Math.min(5 * n, Math.max(n, Math.round(average * n)));
  const base = Math.floor(total / n);
  const scores = Array.from({ length: n }, (_, index) => Math.min(5, base + (index < total - base * n ? 1 : 0)));
  return scores.map((score) => ({ score, order: random() })).toSorted((a, b) => a.order - b.order).map((entry) => entry.score);
}

// Đợt khảo sát của học kỳ hiện tại: câu hỏi, sinh viên đã nộp và phiếu ẩn danh khớp kết quả tổng hợp của dữ liệu mẫu
// (số phiếu, điểm trung bình từng câu, góp ý). Sinh viên hiện tại đã đánh giá lớp thứ 1 và thứ 4 (theo mã lớp) như dữ liệu mẫu.
export async function seedSurveys(tx: Transaction, _context: SeedContext) {
  await tx.insert(surveys).values({ id: SURVEY.id, termId: SURVEY.termId, title: SURVEY.title, opensAt: new Date(SURVEY.opensAt), closesAt: new Date(SURVEY.closesAt) });
  await tx.insert(surveyQuestions).values(SURVEY.questions.map((question, index) => ({ id: question.id, surveyId: SURVEY.id, position: index + 1, group: question.group, text: question.text })));

  const roster = await tx
    .select({ sectionId: enrollments.classSectionId, studentId: enrollments.studentId })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .where(and(eq(enrollments.termId, SURVEY.termId), eq(enrollments.status, "enrolled"), eq(classSections.status, "open")))
    .orderBy(asc(enrollments.id));
  const mine = [...new Set(roster.filter((entry) => entry.studentId === CURRENT_STUDENT_ID).map((entry) => entry.sectionId))];
  const mineSections = await tx.select({ id: classSections.id, code: classSections.code }).from(classSections).where(inArray(classSections.id, mine));
  const mineSubmitted = new Map(
    mineSections
      .toSorted((a, b) => a.code.localeCompare(b.code))
      .flatMap((section, index) => (index % 3 === 0 ? [[section.id, dayjs().add(Math.min(0, index - 2), "day").format("YYYY-MM-DD")] as const] : [])),
  );

  const opened = dayjs(SURVEY.opensAt).startOf("day");
  const span = Math.max(1, dayjs().startOf("day").diff(opened, "day") + 1);
  const resultOf = new Map(SURVEY_RESULTS.map((result) => [result.classSectionId, result]));
  const sectionIds = [...new Set([...SURVEY_RESULTS.map((result) => result.classSectionId), ...mineSubmitted.keys()])];

  const submissions: (typeof surveySubmissions.$inferInsert)[] = [];
  const responses: (typeof surveyResponses.$inferInsert)[] = [];
  const answers: (typeof surveyAnswers.$inferInsert)[] = [];
  for (const [position, sectionId] of sectionIds.entries()) {
    const random = createRandom(position * 97 + 13);
    const result = resultOf.get(sectionId);
    const members = roster.filter((entry) => entry.sectionId === sectionId).map((entry) => entry.studentId);
    const others = members.filter((id) => id !== CURRENT_STUDENT_ID);
    const meToo = mineSubmitted.has(sectionId);
    const target = Math.min(members.length, Math.max(meToo ? 1 : 0, result?.responses ?? 1));
    const submitters = [...(meToo ? [CURRENT_STUDENT_ID] : []), ...others].slice(0, target);
    const scores = SURVEY.questions.map((question) => scoresFor(result?.averages[question.id] ?? 4, submitters.length, random));
    for (const [index, studentId] of submitters.entries()) {
      const day = studentId === CURRENT_STUDENT_ID ? mineSubmitted.get(sectionId)! : opened.add(Math.floor(random() * span), "day").format("YYYY-MM-DD");
      submissions.push({ surveyId: SURVEY.id, classSectionId: sectionId, studentId, submittedOn: day });
      // Phiếu không gắn với người nộp; góp ý mẫu rải vào các phiếu cuối để không trùng thứ tự người nộp.
      const responseId = anonymousResponseId(day);
      const comment = result?.comments[submitters.length - 1 - index] ?? null;
      responses.push({ id: responseId, surveyId: SURVEY.id, classSectionId: sectionId, comment });
      SURVEY.questions.forEach((question, questionIndex) => answers.push({ responseId, questionId: question.id, score: scores[questionIndex][index] }));
    }
  }
  await tx.insert(surveySubmissions).values(submissions);
  await tx.insert(surveyResponses).values(responses);
  for (let start = 0; start < answers.length; start += 1000) await tx.insert(surveyAnswers).values(answers.slice(start, start + 1000));
  return { submissions: submissions.length, responses: responses.length };
}
