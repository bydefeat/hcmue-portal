import { z } from "zod";
import { newId } from "@/shared/libs/id.lib";

// Phiếu khảo sát: mỗi câu một mức 1..5 (khóa là id câu hỏi), góp ý tùy chọn. Đủ câu hay chưa kiểm ở server theo phiếu thật.
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

// Câu hỏi của phiếu còn thiếu hoặc câu trả lời không thuộc phiếu.
export function answerProblems(questionIds: string[], answers: Record<string, number>) {
  const given = Object.keys(answers);
  return {
    missing: questionIds.filter((id) => !(id in answers)),
    unknown: given.filter((id) => !questionIds.includes(id)),
  };
}

// Id phiếu trả lời dạng uuid v7 nhưng phần thời gian chỉ là đầu ngày nộp (UTC): uuid v7 thường mang mốc mili giây,
// đối chiếu với nhật ký truy cập là lần ra người nộp. Phần ngẫu nhiên giữ nguyên nên vẫn không trùng.
export function anonymousResponseId(day: string, id = newId()) {
  const stamp = Date.parse(`${day}T00:00:00Z`).toString(16).padStart(12, "0");
  return `${stamp.slice(0, 8)}-${stamp.slice(8, 12)}${id.slice(13)}`;
}

// Điểm trung bình mỗi câu và điểm chung (trung bình các câu), làm tròn 2 chữ số như báo cáo.
export function summarizeScores(questionIds: string[], averages: Record<string, number>) {
  const values = questionIds.map((id) => averages[id]).filter((value): value is number => value !== undefined);
  const overall = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    averages: Object.fromEntries(questionIds.filter((id) => averages[id] !== undefined).map((id) => [id, Math.round(averages[id] * 100) / 100])),
    overall: Math.round(overall * 100) / 100,
  };
}
