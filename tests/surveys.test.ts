import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { and, eq, notInArray, sql, TransactionRollbackError } from "drizzle-orm";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { parseInput } from "@/shared/libs/action.lib";
import { pgErrorMessage } from "@/shared/libs/pg-error.lib";
import { ALL_PERMISSIONS } from "@/modules/access/access.constant";
import type { Viewer } from "@/modules/access/access.type";
import { user } from "@/modules/authentication/authentication.schema";
import { enrollments } from "@/modules/course-registration/course-registration.schema";
import { notifications } from "@/modules/notifications/notifications.schema";
import { SURVEYS_CONSTRAINT_MESSAGE } from "@/modules/surveys/surveys.constant";
import { recordSurveySubmission, remindNonRespondents, saveSurvey, sealedSurveyIdsForLecturer, sealSurvey, setSurveyOpen, SurveyInputError } from "@/modules/surveys/surveys.lib";
import { MIDTERM_SURVEY, SURVEY } from "@/modules/surveys/surveys.mock";
import { answerProblems, pickSurvey, responseRate, summarizeScores, SURVEY_SAVE_SCHEMA, SURVEY_SUBMIT_SCHEMA, weightedOverall } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";
import { CURRENT_LECTURER_ID, CURRENT_STUDENT_ID } from "@/modules/users/users.mock";
import { students } from "@/modules/users/users.schema";

after(() => db.$client.end());

const failure = (promise: Promise<unknown>) => promise.then(() => null).catch((caught: unknown) => caught);

const Q1 = "0192f3a4-0000-7000-8000-000000000001";
const Q2 = "0192f3a4-0000-7000-8000-000000000002";

class Rollback extends Error {}

async function inRollback(run: (tx: Transaction) => Promise<void>) {
  await db
    .transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError) && !(error instanceof Rollback)) throw error;
    });
}

const rejectedIn = (tx: Transaction, run: (sp: Transaction) => Promise<unknown>) =>
  failure(tx.transaction(async (sp) => void (await run(sp)))).then((error) => (error instanceof SurveyInputError ? error.message : pgErrorMessage(error, SURVEYS_CONSTRAINT_MESSAGE)));

const viewerOf = (id: string): Viewer => ({
  id,
  name: "Trần Minh Khoa",
  code: "PDT0001",
  roleId: "academic-head",
  roleKey: "academic-head",
  roleName: "Trưởng phòng Đào tạo",
  unit: "Phòng Đào tạo",
  faculty: null,
  permissions: [...ALL_PERMISSIONS],
  assignmentId: null,
});

const adminViewer = async () => viewerOf((await db.select({ id: user.id }).from(user).where(eq(user.email, "khoatm@hcmue.edu.vn")))[0].id);

const QUESTIONS = [
  { group: "Nội dung", text: "Mục tiêu học phần rõ ràng" },
  { group: "Phương pháp", text: "Giảng viên giải thích dễ hiểu" },
  { group: "Tổng thể", text: "Tôi hài lòng với học phần" },
];

describe("surveys: phiếu ẩn danh", () => {
  test("survey_responses, survey_answers không có cột trỏ tới sinh viên hay thời điểm; survey_submissions không lưu thời điểm", async () => {
    const rows = await db.execute<{ table_name: string; column_name: string }>(
      sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('survey_responses', 'survey_answers', 'survey_submissions')`,
    );
    const columns = rows.map((row) => `${row.table_name}.${row.column_name}`);
    assert.ok(columns.filter((column) => !column.startsWith("survey_submissions")).every((column) => !/student|user|submitted|created|_at|_on/.test(column)), columns.join(", "));
    assert.ok(columns.filter((column) => column.startsWith("survey_submissions")).every((column) => !/submitted|created|_at|_on/.test(column)), columns.join(", "));
  });

  test("id phiếu là uuid v4 ngẫu nhiên, không mang thời điểm", async () => {
    const rows = await db.select({ id: surveyResponses.id }).from(surveyResponses).limit(50);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.id[14] === "4"));
  });

  test("nộp phiếu khi đợt mở: ghi dấu đã nộp và phiếu không gắn sinh viên; nộp lại bị chặn; đóng đợt thì xáo phiếu (id mới, kết quả giữ nguyên)", async () => {
    const [section] = await db
      .select({ id: enrollments.classSectionId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, CURRENT_STUDENT_ID),
          eq(enrollments.termId, SURVEY.termId),
          eq(enrollments.status, "enrolled"),
          notInArray(enrollments.classSectionId, db.select({ id: surveySubmissions.classSectionId }).from(surveySubmissions).where(and(eq(surveySubmissions.surveyId, SURVEY.id), eq(surveySubmissions.studentId, CURRENT_STUDENT_ID)))),
        ),
      )
      .limit(1);
    const questions = await db.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, SURVEY.id));
    const answers = Object.fromEntries(questions.map((question) => [question.id, 4]));
    const input = parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: SURVEY.id, classSectionId: section.id, answers, comment: "Rất hữu ích" });
    assert.ok(input.ok);
    await inRollback(async (tx) => {
      const totals = async () =>
        (
          await tx.execute<{ section: string; responses: number; average: number }>(sql`SELECT r.class_section_id AS section, count(DISTINCT r.id)::int AS responses, avg(a.score)::float AS average
          FROM survey_responses r JOIN survey_answers a ON a.response_id = r.id WHERE r.survey_id = ${SURVEY.id} GROUP BY 1 ORDER BY 1`)
        ).map((row) => ({ ...row }));
      const before = await totals();
      await recordSurveySubmission(tx, CURRENT_STUDENT_ID, input.data);
      assert.match(await rejectedIn(tx, (sp) => recordSurveySubmission(sp, CURRENT_STUDENT_ID, input.data)), /đã gửi đánh giá lớp này/);
      const missing = parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: SURVEY.id, classSectionId: section.id, answers: { [questions[0].id]: 5 } });
      assert.ok(missing.ok);
      assert.match(await rejectedIn(tx, (sp) => recordSurveySubmission(sp, CURRENT_STUDENT_ID, missing.data)), /câu chưa chọn/);
      const afterSubmit = await totals();
      assert.equal(afterSubmit.reduce((sum, row) => sum + row.responses, 0), before.reduce((sum, row) => sum + row.responses, 0) + 1);

      assert.equal((await sealSurvey(tx, SURVEY.id)).responses, 0);
      const ids = new Set((await tx.select({ id: surveyResponses.id }).from(surveyResponses).where(eq(surveyResponses.surveyId, SURVEY.id))).map((row) => row.id));
      await setSurveyOpen(tx, await adminViewer(), SURVEY.id, false);
      const resealed = await tx.select({ id: surveyResponses.id }).from(surveyResponses).where(eq(surveyResponses.surveyId, SURVEY.id));
      assert.equal(resealed.length, ids.size);
      assert.ok(resealed.every((row) => !ids.has(row.id) && row.id[14] === "4"), "mọi phiếu có id mới");
      assert.deepEqual(await totals(), afterSubmit, "số phiếu, điểm trung bình từng lớp giữ nguyên");
      const [sealed] = await tx.select({ sealedAt: surveys.sealedAt }).from(surveys).where(eq(surveys.id, SURVEY.id));
      assert.ok(sealed.sealedAt);
      const xmins = await tx.execute<{ distinct: number }>(sql`SELECT count(DISTINCT xmin::text)::int AS distinct FROM survey_responses WHERE survey_id = ${SURVEY.id}`);
      assert.equal(xmins[0].distinct, 1);
      assert.match(await rejectedIn(tx, (sp) => recordSurveySubmission(sp, CURRENT_STUDENT_ID, input.data)), /chưa mở hoặc đã đóng/);
    });
  });

  test("seed: đợt giữa kỳ đã đóng và đã xáo, đợt hiện tại đang mở chưa xáo", async () => {
    const rows = await db.select({ id: surveys.id, sealedAt: surveys.sealedAt }).from(surveys);
    assert.ok(rows.find((row) => row.id === MIDTERM_SURVEY.id)?.sealedAt);
    assert.equal(rows.find((row) => row.id === SURVEY.id)?.sealedAt, null);
  });
});

describe("surveys: giảng viên xem lại các đợt đã đóng", () => {
  test("chỉ đợt đã đóng, đã xáo phiếu và có lớp của giảng viên trong học kỳ; mới nhất trước; chọn id ngoài danh sách thì về đợt mới nhất", async () => {
    await inRollback(async (tx) => {
      const [{ termId }] = await tx.select({ termId: surveys.termId }).from(surveys).where(eq(surveys.id, MIDTERM_SURVEY.id));
      const day = 86_400_000;
      const [older, unsealed, otherTerm] = await tx
        .insert(surveys)
        .values([
          { termId, title: "Đợt cũ thử", opensAt: new Date(Date.now() - 60 * day), closesAt: new Date(Date.now() - 50 * day), sealedAt: new Date(Date.now() - 49 * day) },
          { termId, title: "Đợt chưa xáo thử", opensAt: new Date(Date.now() - 40 * day), closesAt: new Date(Date.now() - 39 * day) },
          { termId: sql`(SELECT id FROM terms WHERE NOT EXISTS (SELECT 1 FROM class_sections cs WHERE cs.term_id = terms.id) LIMIT 1)`, title: "Học kỳ không dạy thử", opensAt: new Date(Date.now() - 30 * day), closesAt: new Date(Date.now() - 29 * day), sealedAt: new Date(Date.now() - 28 * day) },
        ])
        .returning({ id: surveys.id });
      const ids = await sealedSurveyIdsForLecturer(tx, CURRENT_LECTURER_ID);
      assert.deepEqual(ids, [MIDTERM_SURVEY.id, older.id]);
      assert.ok(!ids.includes(unsealed.id) && !ids.includes(otherTerm.id) && !ids.includes(SURVEY.id));
      const rows = ids.map((id) => ({ id }));
      assert.equal(pickSurvey(rows, older.id)?.id, older.id);
      assert.equal(pickSurvey(rows, unsealed.id)?.id, MIDTERM_SURVEY.id);
      assert.equal(pickSurvey(rows, undefined)?.id, MIDTERM_SURVEY.id);
      assert.equal(pickSurvey([], older.id), null);
    });
  });
});

describe("surveys: quản lý đợt", () => {
  test("tạo đợt, sửa câu hỏi khi chưa mở; mở rồi thì không sửa câu hỏi, không đổi thời điểm mở; đã đóng thì không sửa", async () => {
    const viewer = await adminViewer();
    const opensAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const closesAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const parsed = parseInput(SURVEY_SAVE_SCHEMA, { termId: SURVEY.termId, title: "Khảo sát thử", opensAt, closesAt, questions: QUESTIONS });
    assert.ok(parsed.ok);
    assert.ok(!parseInput(SURVEY_SAVE_SCHEMA, { termId: SURVEY.termId, title: "x", opensAt: closesAt, closesAt: opensAt, questions: QUESTIONS.slice(0, 2) }).ok);
    await inRollback(async (tx) => {
      const id = await saveSurvey(tx, viewer, parsed.data);
      const edited = { ...parsed.data, id, questions: [...QUESTIONS, { group: "Tác phong", text: "Lên lớp đúng giờ" }] };
      await saveSurvey(tx, viewer, edited);
      assert.equal((await tx.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, id))).length, 4);
      await setSurveyOpen(tx, viewer, id, true);
      assert.match(await rejectedIn(tx, (sp) => saveSurvey(sp, viewer, edited)), /không đổi học kỳ hay thời điểm mở/);
      const [row] = await tx.select({ opensAt: surveys.opensAt }).from(surveys).where(eq(surveys.id, id));
      assert.match(await rejectedIn(tx, (sp) => saveSurvey(sp, viewer, { ...edited, opensAt: row.opensAt.toISOString(), questions: QUESTIONS })), /không sửa câu hỏi/);
      await saveSurvey(tx, viewer, { ...edited, opensAt: row.opensAt.toISOString(), title: "Khảo sát thử (gia hạn)" });
      assert.match(await rejectedIn(tx, (sp) => setSurveyOpen(sp, viewer, id, true)), /đã mở trước đó/);
      await setSurveyOpen(tx, viewer, id, false);
      assert.match(await rejectedIn(tx, (sp) => saveSurvey(sp, viewer, { ...edited, opensAt: row.opensAt.toISOString() })), /đã đóng/);
    });
  });

  test("DB: câu hỏi đã có câu trả lời không sửa, xóa được", async () => {
    const [answer] = await db.select({ questionId: surveyAnswers.questionId }).from(surveyAnswers).limit(1);
    await inRollback(async (tx) => {
      assert.equal(await rejectedIn(tx, (sp) => sp.update(surveyQuestions).set({ text: "Câu khác" }).where(eq(surveyQuestions.id, answer.questionId))), SURVEYS_CONSTRAINT_MESSAGE.survey_questions_locked);
      assert.equal(await rejectedIn(tx, (sp) => sp.delete(surveyQuestions).where(eq(surveyQuestions.id, answer.questionId))), SURVEYS_CONSTRAINT_MESSAGE.survey_questions_locked);
    });
  });

  test("nhắc sinh viên chưa làm: chỉ khi đợt mở, không nhắc dồn trong 24 giờ, sinh viên có tài khoản nhận thông báo", async () => {
    const viewer = await adminViewer();
    await inRollback(async (tx) => {
      const result = await remindNonRespondents(tx, viewer, SURVEY.id);
      assert.ok(result.students > 0);
      const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, CURRENT_STUDENT_ID));
      const mine = await tx.select({ title: notifications.title }).from(notifications).where(and(eq(notifications.recipientUserId, student.userId!), sql`${notifications.title} LIKE 'Còn % lớp chưa khảo sát giảng dạy'`));
      assert.equal(mine.length, 1);
      assert.match(await rejectedIn(tx, (sp) => remindNonRespondents(sp, viewer, SURVEY.id)), /Đã nhắc trong 24 giờ/);
      assert.match(await rejectedIn(tx, (sp) => remindNonRespondents(sp, viewer, MIDTERM_SURVEY.id)), /đang mở/);
    });
  });
});

describe("surveys: kiểm dữ liệu và tổng hợp", () => {
  test("mức 1..5, góp ý trống thành null", () => {
    const parsed = parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: Q1, classSectionId: Q2, answers: { [Q1]: 5, [Q2]: 1 }, comment: "   " });
    assert.ok(parsed.ok);
    assert.equal(parsed.data.comment, null);
    assert.ok(!parseInput(SURVEY_SUBMIT_SCHEMA, { surveyId: Q1, classSectionId: Q2, answers: { [Q1]: 6 } }).ok);
  });

  test("phát hiện câu còn thiếu và câu không thuộc phiếu", () => {
    assert.deepEqual(answerProblems([Q1, Q2], { [Q1]: 4, x: 3 }), { missing: [Q2], unknown: ["x"] });
  });

  test("điểm chung là trung bình các câu; tỉ lệ phản hồi tính cả lớp 0 phiếu; điểm chung toàn bộ theo số phiếu", () => {
    assert.deepEqual(summarizeScores([Q1, Q2], { [Q1]: 4.333333, [Q2]: 3 }), { averages: { [Q1]: 4.33, [Q2]: 3 }, overall: 3.67 });
    const rows = [
      { responses: 10, enrolled: 40, overall: 4 },
      { responses: 0, enrolled: 40, overall: 0 },
    ];
    assert.deepEqual(responseRate(rows), { responses: 10, enrolled: 80, percent: 13 });
    assert.equal(weightedOverall(rows), 4);
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

  test("mỗi sinh viên nộp một lần mỗi lớp; mức ngoài 1..5 bị chặn", async () => {
    const [submission] = await db.select().from(surveySubmissions).limit(1);
    const error = await failure(db.insert(surveySubmissions).values({ ...submission }));
    assert.equal(pgErrorMessage(error, SURVEYS_CONSTRAINT_MESSAGE), SURVEYS_CONSTRAINT_MESSAGE.survey_submissions_survey_id_class_section_id_student_id_pk);
    const [answer] = await db.select().from(surveyAnswers).limit(1);
    const score = await failure(
      db
        .update(surveyAnswers)
        .set({ score: 0 })
        .where(and(eq(surveyAnswers.responseId, answer.responseId), eq(surveyAnswers.questionId, answer.questionId))),
    );
    assert.equal(pgErrorMessage(score, SURVEYS_CONSTRAINT_MESSAGE), SURVEYS_CONSTRAINT_MESSAGE.survey_answers_score_range);
  });
});
