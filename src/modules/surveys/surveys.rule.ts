import { z } from "zod";

export const SURVEY_SUBMIT_SCHEMA = z.object({
  surveyId: z.uuid("Phiếu khảo sát không hợp lệ"),
  classSectionId: z.uuid("Lớp học phần không hợp lệ"),
  answers: z.record(z.uuid(), z.int("Chọn một mức đánh giá").min(1, "Chọn một mức đánh giá").max(5, "Chọn một mức đánh giá")),
  comment: z
    .string()
    .trim()
    .max(1000, "Tối đa 1000 ký tự")
    .optional()
    .transform((value) => value || null),
});

export type SurveySubmitInput = z.input<typeof SURVEY_SUBMIT_SCHEMA>;

const QUESTION = z.object({
  group: z.string("Nhập nhóm câu hỏi").trim().min(1, "Nhập nhóm câu hỏi").max(100, "Tối đa 100 ký tự"),
  text: z.string("Nhập nội dung câu hỏi").trim().min(1, "Nhập nội dung câu hỏi").max(300, "Tối đa 300 ký tự"),
});

export const SURVEY_SAVE_SCHEMA = z
  .object({
    id: z.uuid().nullish(),
    termId: z.uuid("Chọn học kỳ"),
    title: z.string("Nhập tên đợt").trim().min(1, "Nhập tên đợt").max(200, "Tối đa 200 ký tự"),
    opensAt: z.iso.datetime({ offset: true, message: "Chọn thời điểm mở" }),
    closesAt: z.iso.datetime({ offset: true, message: "Chọn thời điểm đóng" }),
    questions: z.array(QUESTION).min(3, "Phiếu cần ít nhất 3 câu hỏi").max(30, "Tối đa 30 câu hỏi"),
  })
  .refine((value) => new Date(value.opensAt) < new Date(value.closesAt), { path: ["closesAt"], message: "Thời điểm đóng phải sau thời điểm mở" });

export type SurveySaveInput = z.input<typeof SURVEY_SAVE_SCHEMA>;

export function answerProblems(questionIds: string[], answers: Record<string, number>) {
  const given = Object.keys(answers);
  return {
    missing: questionIds.filter((id) => !(id in answers)),
    unknown: given.filter((id) => !questionIds.includes(id)),
  };
}

export function summarizeScores(questionIds: string[], averages: Record<string, number>) {
  const values = questionIds.map((id) => averages[id]).filter((value): value is number => value !== undefined);
  const overall = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    averages: Object.fromEntries(questionIds.filter((id) => averages[id] !== undefined).map((id) => [id, Math.round(averages[id] * 100) / 100])),
    overall: Math.round(overall * 100) / 100,
  };
}

export function responseRate(rows: { responses: number; enrolled: number }[]) {
  const enrolled = rows.reduce((sum, row) => sum + row.enrolled, 0);
  const responses = rows.reduce((sum, row) => sum + row.responses, 0);
  return { responses, enrolled, percent: enrolled > 0 ? Math.round((responses / enrolled) * 100) : 0 };
}

export function weightedOverall(rows: { responses: number; overall: number }[]) {
  const responses = rows.reduce((sum, row) => sum + row.responses, 0);
  return responses > 0 ? rows.reduce((sum, row) => sum + row.overall * row.responses, 0) / responses : 0;
}

export function pickSurvey<T extends { id: string }>(rows: T[], id: string | undefined): T | null {
  return rows.find((row) => row.id === id) ?? rows[0] ?? null;
}
