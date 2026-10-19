import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/shared/libs/db.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import { SURVEYS_CONSTRAINT_MESSAGE } from "@/modules/surveys/surveys.constant";
import { SURVEY } from "@/modules/surveys/surveys.mock";
import { anonymousResponseId, answerProblems, summarizeScores, SURVEY_SUBMIT_SCHEMA } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyResponses, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const failure = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught);

const Q1 = "0192f3a4-0000-7000-8000-000000000001";
const Q2 = "0192f3a4-0000-7000-8000-000000000002";

describe("surveys: phiếu ẩn danh", () => {
  test("id phiếu là uuid v7 chỉ mang mốc đầu ngày nộp, không mang giờ", () => {
    const first = anonymousResponseId("2026-10-19");
    const second = anonymousResponseId("2026-10-19");
    assert.ok(isUuid(first) && first[14] === "7");
    assert.notEqual(first, second);
    assert.equal(parseInt(first.replace("-", "").slice(0, 12), 16), Date.parse("2026-10-19T00:00:00Z"));
    assert.equal(first.slice(0, 13), second.slice(0, 13));
  });

  test("survey_responses và survey_answers không có cột nào trỏ tới sinh viên", async () => {
    const rows = await db.execute<{ table_name: string; column_name: string }>(
      sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('survey_responses', 'survey_answers')`,
    );
    const columns = rows.map((row) => `${row.table_name}.${row.column_name}`);
    assert.ok(columns.length > 0);
    assert.ok(columns.every((column) => !/student|user|submitted|created/.test(column)), columns.join(", "));
  });
});

describe("surveys: kiểm dữ liệu", () => {
  test("mức 1..5, góp ý trống thành null", () => {
    const parsed = parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: Q1, classSectionId: Q2, answers: { [Q1]: 5, [Q2]: 1 }, comment: "   " });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.comment, null);
    assert.ok(!parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: Q1, classSectionId: Q2, answers: { [Q1]: 6 } }).ok);
    assert.ok(!parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: Q1, classSectionId: Q2, answers: { q1: 4 } }).ok);
  });

  test("phát hiện câu còn thiếu và câu không thuộc phiếu", () => {
    assert.deepEqual(answerProblems([Q1, Q2], { [Q1]: 4, x: 3 }), { missing: [Q2], unknown: ["x"] });
    assert.deepEqual(answerProblems([Q1], { [Q1]: 4 }), { missing: [], unknown: [] });
  });

  test("điểm chung là trung bình các câu, làm tròn 2 chữ số", () => {
    assert.deepEqual(summarizeScores([Q1, Q2], { [Q1]: 4.333333, [Q2]: 3 }), { averages: { [Q1]: 4.33, [Q2]: 3 }, overall: 3.67 });
    assert.deepEqual(summarizeScores([Q1], {}), { averages: {}, overall: 0 });
  });
});

describe("surveys: ràng buộc ở DB", () => {
  test("chỉ sinh viên đang học lớp mới nộp được (trigger survey_submissions_enrolled)", async () => {
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.termId, SURVEY.termId)).limit(1);
    const members = db.select({ id: enrollments.studentId }).from(enrollments).where(eq(enrollments.classSectionId, enrollment.classSectionId));
    const [outsider] = await db.select({ id: students.id }).from(students).where(notInArray(students.id, members)).limit(1);
    const error = await failure(db.insert(surveySubmissions).values({ surveyId: SURVEY.id, classSectionId: enrollment.classSectionId, studentId: outsider.id }));
    assert.equal(pgErrorMessage(error, SURVEYS_CONSTRAINT_MESSAGE), SURVEYS_CONSTRAINT_MESSAGE.survey_submissions_enrolled);
  });

  test("mỗi sinh viên nộp một lần mỗi lớp", async () => {
    const [submission] = await db.select().from(surveySubmissions).limit(1);
    const error = await failure(db.insert(surveySubmissions).values({ ...submission }));
    assert.equal(pgErrorMessage(error, SURVEYS_CONSTRAINT_MESSAGE), SURVEYS_CONSTRAINT_MESSAGE.survey_submissions_survey_id_class_section_id_student_id_pk);
  });

  test("mức đánh giá ngoài 1..5 bị chặn", async () => {
    const [answer] = await db.select().from(surveyAnswers).limit(1);
    const error = await failure(
      db
        .update(surveyAnswers)
        .set({ score: 0 })
        .where(and(eq(surveyAnswers.responseId, answer.responseId), eq(surveyAnswers.questionId, answer.questionId))),
    );
    assert.equal(pgErrorMessage(error, SURVEYS_CONSTRAINT_MESSAGE), SURVEYS_CONSTRAINT_MESSAGE.survey_answers_score_range);
  });

  test("phiếu không gắn được với người nộp: mọi phiếu chung một ngày cùng tiền tố id", async () => {
    const rows = await db
      .select({ prefix: sql<string>`left(${surveyResponses.id}::text, 13)`, total: sql<number>`count(*)::int` })
      .from(surveyResponses)
      .groupBy(sql`1`);
    assert.ok(rows.length > 0);
    for (const row of rows) assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}$/.test(row.prefix));
    assert.ok(rows.every((row) => parseInt(row.prefix.replace("-", ""), 16) % 86_400_000 === 0));
  });
});
