"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { SURVEYS_CONSTRAINT_MESSAGE } from "@/modules/surveys/surveys.constant";
import { anonymousResponseId, answerProblems, SURVEY_SUBMIT_SCHEMA, type SurveySubmitInput } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { getCurrentStudent } from "@/modules/users/users.query";

class InputError extends Error {}

// Sinh viên gửi phiếu đánh giá một lớp đang học, trong thời gian đợt khảo sát mở. survey_submissions chỉ ghi "đã nộp"
// (để nhắc và chặn nộp lần hai), câu trả lời nằm ở survey_responses không có khóa tới sinh viên; ngày nộp chỉ lưu ngày.
// DB chặn thêm: trigger survey_submissions_enrolled (đang học lớp), khóa chính survey_submissions (một lần mỗi lớp).
export async function submitSurvey(input: SurveySubmitInput): Promise<ActionResult<{ classSectionId: string; submittedAt: string }>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(SURVEY_SUBMIT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  const { surveyId, classSectionId, answers, comment } = parsed.data;
  let submittedOn: string;
  try {
    submittedOn = await db.transaction(async (tx) => {
      const [survey] = await tx
        .select({
          isOpen: sql<boolean>`now() BETWEEN ${surveys.opensAt} AND ${surveys.closesAt}`,
          today: sql<string>`to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`,
        })
        .from(surveys)
        .where(eq(surveys.id, surveyId));
      if (!survey) throw new InputError("Đợt khảo sát không còn, tải lại trang.");
      if (!survey.isOpen) throw new InputError("Đợt khảo sát chưa mở hoặc đã đóng.");
      const questions = await tx.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(asc(surveyQuestions.position));
      const { missing, unknown } = answerProblems(
        questions.map((question) => question.id),
        answers,
      );
      if (unknown.length > 0) throw new InputError("Phiếu khảo sát đã thay đổi, tải lại trang rồi đánh giá lại.");
      if (missing.length > 0) throw new InputError(`Còn ${missing.length} câu chưa chọn mức đánh giá.`);

      await tx.insert(surveySubmissions).values({ surveyId, classSectionId, studentId: student.id, submittedOn: survey.today });
      const [response] = await tx
        .insert(surveyResponses)
        .values({ id: anonymousResponseId(survey.today), surveyId, classSectionId, comment })
        .returning({ id: surveyResponses.id });
      await tx.insert(surveyAnswers).values(questions.map((question) => ({ responseId: response.id, questionId: question.id, score: answers[question.id] })));
      return survey.today;
    });
  } catch (error) {
    if (error instanceof InputError) return actionError(error.message);
    return actionFailure(error, SURVEYS_CONSTRAINT_MESSAGE);
  }
  revalidatePath("/application/surveys");
  revalidatePath("/administrator/reports/surveys");
  revalidatePath("/lecturer/workload");
  return actionOk({ classSectionId, submittedAt: submittedOn });
}

