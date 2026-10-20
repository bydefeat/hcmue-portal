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

// Giờ hiện tại dùng clock_timestamp() (không phải now(), giờ bắt đầu giao dịch) để mở rồi đóng trong cùng giao dịch vẫn đúng thứ tự.
// Ẩn danh của phiếu (cân nhắc ở mức DB, không chỉ giao diện):
// - survey_submissions chỉ ghi "đã nộp" (đợt, lớp, sinh viên), không thời điểm; survey_responses không có cột thời gian, không
//   khóa tới sinh viên, id là uuid v4 ngẫu nhiên (uuid v7 mang mốc thời gian, đối chiếu với nhật ký truy cập là ra người nộp).
// - Dấu "đã nộp" và phiếu phải ghi trong cùng giao dịch (không thì nộp hai lần hoặc mất phiếu), nên lúc đợt còn mở hai dòng có
//   chung xmin và nằm cạnh nhau trên đĩa: người đọc thẳng DB vẫn ghép được. Vì vậy khi đợt đóng, sealSurvey chép lại toàn bộ
//   phiếu của đợt theo thứ tự ngẫu nhiên, id mới, trong một giao dịch rồi xóa bản cũ: mọi phiếu cùng một xmin, thứ tự trên đĩa
//   không còn theo thứ tự nộp. Giảng viên chỉ xem kết quả sau bước này (đợt đã đóng và đã xáo).
// Còn lại: bản cũ nằm ở dòng chết tới khi autovacuum dọn (chỉ superuser đọc được bằng công cụ đọc trang), và trong lúc đợt mở
// quản trị DB vẫn ghép được; giao diện không bao giờ trả dữ liệu theo người nộp.
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

// Xáo lại phiếu của đợt đã đóng (xem chú thích ở recordSurveySubmission). Chạy lặp lại không đổi gì thêm.
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

// Các đợt giảng viên được xem kết quả (mới nhất trước): đã đóng, đã xáo phiếu và giảng viên có dạy lớp trong học kỳ của đợt.
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

// Tác vụ định kỳ surveys: xáo phiếu các đợt vừa đóng (mỗi đợt một giao dịch). Nên chạy mỗi giờ.
export async function sealClosedSurveys() {
  const due = await db
    .select({ id: surveys.id })
    .from(surveys)
    .where(and(lte(surveys.closesAt, sql`clock_timestamp()`), isNull(surveys.sealedAt)));
  let responses = 0;
  for (const survey of due) responses += (await db.transaction((tx) => sealSurvey(tx, survey.id))).responses;
  return { surveysSealed: due.length, responsesResealed: responses };
}

// Nhắc sinh viên còn lớp chưa đánh giá trong đợt đang mở; cách lần nhắc trước ít nhất SURVEY_REMIND_GAP_HOURS giờ.
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
  // Gom theo số lớp còn thiếu để mỗi nhóm một lần ghi thông báo.
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

// Tạo hoặc sửa đợt khảo sát. Đợt đã mở: chỉ đổi tên và thời điểm đóng (không đổi câu hỏi, thời điểm mở); đợt đã đóng không sửa.
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

// Mở ngay (đợt chưa mở) hoặc đóng ngay (đợt đang mở). Đóng thì xáo phiếu luôn để giảng viên xem được kết quả.
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
