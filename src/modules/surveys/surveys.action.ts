"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/shared/libs/db.lib";
import { actionError, actionFailure, actionOk, parseInput, type ActionResult } from "@/shared/libs/action.lib";
import { isUuid } from "@/shared/libs/id.lib";
import { requirePermission } from "@/modules/access/access.query";
import { SURVEYS_CONSTRAINT_MESSAGE } from "@/modules/surveys/surveys.constant";
import { recordSurveySubmission, remindNonRespondents, saveSurvey as saveSurveyRound, setSurveyOpen, SurveyInputError } from "@/modules/surveys/surveys.lib";
import { SURVEY_SAVE_SCHEMA, SURVEY_SUBMIT_SCHEMA, type SurveySaveInput, type SurveySubmitInput } from "@/modules/surveys/surveys.rule";
import { getCurrentStudent } from "@/modules/users/users.query";

function failure(error: unknown) {
  if (error instanceof SurveyInputError) return actionError(error.message, error.field ? { [error.field]: error.message } : undefined);
  return actionFailure(error, SURVEYS_CONSTRAINT_MESSAGE);
}

function revalidateSurveys() {
  revalidatePath("/application/surveys");
  revalidatePath("/administrator/reports/surveys");
  revalidatePath("/lecturer/workload");
}

// Sinh viên gửi phiếu đánh giá một lớp đang học, trong thời gian đợt khảo sát mở. Ẩn danh: xem recordSurveySubmission.
// DB chặn thêm: trigger survey_submissions_enrolled (đang học lớp), khóa chính survey_submissions (một lần mỗi lớp).
export async function submitSurvey(input: SurveySubmitInput): Promise<ActionResult<{ classSectionId: string }>> {
  const student = await getCurrentStudent();
  const parsed = parseInput(SURVEY_SUBMIT_SCHEMA, input);
  if (!parsed.ok) return parsed;
  try {
    await db.transaction((tx) => recordSurveySubmission(tx, student.id, parsed.data));
  } catch (error) {
    return failure(error);
  }
  revalidateSurveys();
  return actionOk({ classSectionId: parsed.data.classSectionId });
}

// Phòng Đào tạo tạo hoặc sửa đợt khảo sát (học kỳ, thời gian mở, đóng, bộ câu hỏi khi chưa mở).
export async function saveSurvey(input: SurveySaveInput): Promise<ActionResult<{ id: string }>> {
  const viewer = await requirePermission("surveys.manage");
  const parsed = parseInput(SURVEY_SAVE_SCHEMA, input);
  if (!parsed.ok) return parsed;
  let id: string;
  try {
    id = await db.transaction((tx) => saveSurveyRound(tx, viewer, parsed.data));
  } catch (error) {
    return failure(error);
  }
  revalidateSurveys();
  return actionOk({ id });
}

// Mở ngay đợt chưa mở, hoặc đóng ngay đợt đang mở (đóng thì xáo phiếu, giảng viên xem được kết quả).
export async function toggleSurveyOpen(id: string, open: boolean): Promise<ActionResult<{ id: string }>> {
  const viewer = await requirePermission("surveys.manage");
  if (!isUuid(id)) return actionError("Đợt khảo sát không hợp lệ.");
  try {
    await db.transaction((tx) => setSurveyOpen(tx, viewer, id, open));
  } catch (error) {
    return failure(error);
  }
  revalidateSurveys();
  return actionOk({ id });
}

// Nhắc sinh viên còn lớp chưa đánh giá (thông báo trên cổng).
export async function remindSurvey(id: string): Promise<ActionResult<{ students: number; notified: number }>> {
  const viewer = await requirePermission("surveys.manage");
  if (!isUuid(id)) return actionError("Đợt khảo sát không hợp lệ.");
  try {
    const result = await db.transaction((tx) => remindNonRespondents(tx, viewer, id));
    revalidatePath("/administrator/reports/surveys");
    return actionOk(result);
  } catch (error) {
    return failure(error);
  }
}
