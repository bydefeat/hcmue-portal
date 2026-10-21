import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, lte, ne, notExists, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type Transaction } from "@/shared/libs/db.lib";
import { formatDateTime } from "@/shared/libs/date.lib";
import type { Viewer } from "@/modules/access/access.type";
import { auditActorOf, recordAudit } from "@/modules/audit/audit.lib";
import { classSections, enrollments, terms } from "@/modules/course-registration/course-registration.schema";
import { notifyStudents } from "@/modules/notifications/notifications.lib";
import { STUDENT_SURVEYS_HREF, SURVEY_REMIND_GAP_HOURS } from "@/modules/surveys/surveys.constant";
import { answerProblems, type SURVEY_SAVE_SCHEMA, type SURVEY_SUBMIT_SCHEMA } from "@/modules/surveys/surveys.rule";
import { surveyAnswers, surveyQuestions, surveyResponses, surveys, surveySubmissions } from "@/modules/surveys/surveys.schema";

export class SurveyInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export async function recordSurveySubmission(tx: Transaction, studentId: string, input: z.output<typeof SURVEY_SUBMIT_SCHEMA>) {
  const { surveyId, classSectionId, answers, comment } = input;
  const [survey] = await tx
    .select({ isOpen: sql<boolean>`clock_timestamp() >= ${surveys.opensAt} AND clock_timestamp() < ${surveys.closesAt}` })
    .from(surveys)
    .where(eq(surveys.id, surveyId))
    .for("share");
  if (!survey) throw new SurveyInputError("Đợt khảo sát không còn, tải lại trang.");
  if (!survey.isOpen) throw new SurveyInputError("Đợt khảo sát chưa mở hoặc đã đóng.");
  const questions = await tx.select({ id: surveyQuestions.id }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, surveyId)).orderBy(asc(surveyQuestions.position));
  const { missing, unknown } = answerProblems(
    questions.map((question) => question.id),
    answers,
  );
  if (unknown.length > 0) throw new SurveyInputError("Phiếu khảo sát đã thay đổi, tải lại trang rồi đánh giá lại.");
  if (missing.length > 0) throw new SurveyInputError(`Còn ${missing.length} câu chưa chọn mức đánh giá.`);
  await tx.insert(surveySubmissions).values({ surveyId, classSectionId, studentId });
  const [response] = await tx.insert(surveyResponses).values({ surveyId, classSectionId, comment }).returning({ id: surveyResponses.id });
  await tx.insert(surveyAnswers).values(questions.map((question) => ({ responseId: response.id, questionId: question.id, score: answers[question.id] })));
}

export async function sealSurvey(tx: Transaction, surveyId: string) {
  const [survey] = await tx
    .select({ isClosed: sql<boolean>`${surveys.closesAt} <= clock_timestamp()`, sealedAt: surveys.sealedAt })
    .from(surveys)
    .where(eq(surveys.id, surveyId))
    .for("update");
  if (!survey || !survey.isClosed || survey.sealedAt) return { responses: 0 };
  await tx.execute(sql`CREATE TEMP TABLE survey_seal_map ON COMMIT DROP AS
    SELECT id AS old_id, gen_random_uuid() AS new_id, class_section_id, comment FROM survey_responses WHERE survey_id = ${surveyId} ORDER BY random()`);
  await tx.execute(sql`INSERT INTO survey_responses (id, survey_id, class_section_id, comment)
    SELECT new_id, ${surveyId}, class_section_id, comment FROM survey_seal_map ORDER BY random()`);
  await tx.execute(sql`INSERT INTO survey_answers (response_id, question_id, score)
    SELECT m.new_id, a.question_id, a.score FROM survey_answers a JOIN survey_seal_map m ON m.old_id = a.response_id ORDER BY random()`);
  const removed = await tx.execute(sql`DELETE FROM survey_responses WHERE id IN (SELECT old_id FROM survey_seal_map)`);
  await tx.execute(sql`DROP TABLE survey_seal_map`);
  await tx.update(surveys).set({ sealedAt: sql`now()` }).where(eq(surveys.id, surveyId));
  return { responses: removed.count };
}

export async function sealedSurveyIdsForLecturer(executor: Transaction | typeof db, lecturerId: string) {
  const rows = await executor
    .select({ id: surveys.id })
    .from(surveys)
    .where(
      and(
        lte(surveys.closesAt, sql`now()`),
        isNotNull(surveys.sealedAt),
        sql`EXISTS (SELECT 1 FROM ${classSections} WHERE ${classSections.termId} = ${surveys.termId} AND ${classSections.lecturerId} = ${lecturerId})`,
      ),
    )
    .orderBy(desc(surveys.opensAt));
  return rows.map((row) => row.id);
}

export async function sealClosedSurveys() {
  const due = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(and(lte(surveys.closesAt, sql`clock_timestamp()`), isNull(surveys.sealedAt)));
  let responses = 0;
  for (const survey of due) responses += (await db.transaction((tx) => sealSurvey(tx, survey.id))).responses;
  return { surveysSealed: due.length, responsesResealed: responses };
}

export async function remindNonRespondents(tx: Transaction, viewer: Viewer, surveyId: string) {
  const [survey] = await tx
    .select({
      title: surveys.title,
      termId: surveys.termId,
      closesAt: surveys.closesAt,
      isOpen: sql<boolean>`clock_timestamp() >= ${surveys.opensAt} AND clock_timestamp() < ${surveys.closesAt}`,
      tooSoon: sql<boolean>`${surveys.remindedAt} IS NOT NULL AND ${surveys.remindedAt} > now() - make_interval(hours => ${SURVEY_REMIND_GAP_HOURS})`,
    })
    .from(surveys)
    .where(eq(surveys.id, surveyId))
    .for("update");
  if (!survey) throw new SurveyInputError("Đợt khảo sát không còn, tải lại trang.");
  if (!survey.isOpen) throw new SurveyInputError("Chỉ nhắc được khi đợt khảo sát đang mở.");
  if (survey.tooSoon) throw new SurveyInputError(`Đã nhắc trong ${SURVEY_REMIND_GAP_HOURS} giờ qua, nhắc lại sau.`);
  const submitted = tx
    .select({ one: sql`1` })
    .from(surveySubmissions)
    .where(and(eq(surveySubmissions.surveyId, surveyId), eq(surveySubmissions.classSectionId, enrollments.classSectionId), eq(surveySubmissions.studentId, enrollments.studentId)));
  const rows = await tx
    .select({ studentId: enrollments.studentId, missing: sql<number>`count(*)::int` })
    .from(enrollments)
    .innerJoin(classSections, eq(classSections.id, enrollments.classSectionId))
    .where(and(eq(enrollments.termId, survey.termId), eq(enrollments.status, "enrolled"), ne(classSections.status, "cancelled"), notExists(submitted)))
    .groupBy(enrollments.studentId);
  let notified = 0;
  const byCount = new Map<number, string[]>();
  for (const row of rows) byCount.set(row.missing, [...(byCount.get(row.missing) ?? []), row.studentId]);
  for (const [missing, studentIds] of byCount) {
    const sent = await notifyStudents(tx, studentIds, {
      kind: "deadline",
      title: `Còn ${missing} lớp chưa khảo sát giảng dạy`,
      body: `${survey.title}. Đợt khảo sát đóng lúc ${formatDateTime(survey.closesAt)}; phiếu ẩn danh, giảng viên chỉ xem kết quả tổng hợp sau khi đóng.`,
      href: STUDENT_SURVEYS_HREF,
    });
    notified += sent.length;
  }
  await tx.update(surveys).set({ remindedAt: sql`now()` }).where(eq(surveys.id, surveyId));
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "update",
    entityType: "survey",
    entityId: surveyId,
    entityLabel: survey.title,
    summary: `Nhắc ${rows.length} sinh viên chưa làm khảo sát (${notified} người có tài khoản cổng nhận thông báo)`,
  });
  return { students: rows.length, notified };
}

export async function saveSurvey(tx: Transaction, viewer: Viewer, input: z.output<typeof SURVEY_SAVE_SCHEMA>) {
  const { id, termId, title, opensAt, closesAt, questions } = input;
  const [term] = await tx.select({ id: terms.id }).from(terms).where(eq(terms.id, termId));
  if (!term) throw new SurveyInputError("Học kỳ không còn trong danh mục.", "termId");
  if (!id) {
    if (new Date(closesAt) <= new Date()) throw new SurveyInputError("Thời điểm đóng phải sau hiện tại.", "closesAt");
    const [row] = await tx.insert(surveys).values({ termId, title, opensAt: new Date(opensAt), closesAt: new Date(closesAt), createdByUserId: viewer.id }).returning({ id: surveys.id });
    await tx.insert(surveyQuestions).values(questions.map((question, index) => ({ surveyId: row.id, position: index + 1, ...question })));
    await recordAudit(tx, { actor: auditActorOf(viewer), action: "create", entityType: "survey", entityId: row.id, entityLabel: title, summary: `Tạo đợt khảo sát ${title} (${questions.length} câu hỏi)` });
    return row.id;
  }
  const [current] = await tx
    .select({ title: surveys.title, termId: surveys.termId, opensAt: surveys.opensAt, closesAt: surveys.closesAt, hasOpened: sql<boolean>`${surveys.opensAt} <= clock_timestamp()`, hasClosed: sql<boolean>`${surveys.closesAt} <= clock_timestamp()` })
    .from(surveys)
    .where(eq(surveys.id, id))
    .for("update");
  if (!current) throw new SurveyInputError("Đợt khảo sát không còn, tải lại trang.");
  if (current.hasClosed) throw new SurveyInputError("Đợt khảo sát đã đóng, không sửa được.");
  if (current.hasOpened) {
    if (termId !== current.termId || new Date(opensAt).getTime() !== current.opensAt.getTime()) throw new SurveyInputError("Đợt đã mở: không đổi học kỳ hay thời điểm mở.", "opensAt");
    if (new Date(closesAt) <= new Date()) throw new SurveyInputError("Thời điểm đóng phải sau hiện tại; muốn đóng ngay thì bấm Đóng đợt.", "closesAt");
    const existing = await tx.select({ group: surveyQuestions.group, text: surveyQuestions.text }).from(surveyQuestions).where(eq(surveyQuestions.surveyId, id)).orderBy(asc(surveyQuestions.position));
    if (JSON.stringify(existing) !== JSON.stringify(questions)) throw new SurveyInputError("Đợt đã mở nên không sửa câu hỏi được.", "questions");
  }
  await tx.update(surveys).set({ termId, title, opensAt: new Date(opensAt), closesAt: new Date(closesAt) }).where(eq(surveys.id, id));
  if (!current.hasOpened) {
    await tx.delete(surveyQuestions).where(eq(surveyQuestions.surveyId, id));
    await tx.insert(surveyQuestions).values(questions.map((question, index) => ({ surveyId: id, position: index + 1, ...question })));
  }
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: "update",
    entityType: "survey",
    entityId: id,
    entityLabel: title,
    summary: `Sửa đợt khảo sát ${title}`,
    changes: [
      ...(current.title !== title ? [{ field: "Tên đợt", before: current.title, after: title }] : []),
      ...(current.closesAt.getTime() !== new Date(closesAt).getTime() ? [{ field: "Đóng lúc", before: formatDateTime(current.closesAt), after: formatDateTime(closesAt) }] : []),
    ],
  });
  return id;
}

export async function setSurveyOpen(tx: Transaction, viewer: Viewer, id: string, open: boolean) {
  const [current] = await tx
    .select({ title: surveys.title, hasOpened: sql<boolean>`${surveys.opensAt} <= clock_timestamp()`, hasClosed: sql<boolean>`${surveys.closesAt} <= clock_timestamp()` })
    .from(surveys)
    .where(eq(surveys.id, id))
    .for("update");
  if (!current) throw new SurveyInputError("Đợt khảo sát không còn, tải lại trang.");
  if (open) {
    if (current.hasOpened) throw new SurveyInputError("Đợt khảo sát đã mở trước đó.");
    await tx.update(surveys).set({ opensAt: sql`clock_timestamp()` }).where(eq(surveys.id, id));
  } else {
    if (!current.hasOpened || current.hasClosed) throw new SurveyInputError("Chỉ đóng được đợt đang mở.");
    await tx.update(surveys).set({ closesAt: sql`clock_timestamp()` }).where(eq(surveys.id, id));
    await sealSurvey(tx, id);
  }
  await recordAudit(tx, {
    actor: auditActorOf(viewer),
    action: open ? "publish" : "lock",
    entityType: "survey",
    entityId: id,
    entityLabel: current.title,
    summary: `${open ? "Mở" : "Đóng"} đợt khảo sát ${current.title}`,
  });
}
