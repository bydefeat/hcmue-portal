import { z } from "zod";
import { dayjs } from "@/shared/libs/date.lib";
import { checkUpload } from "@/shared/libs/upload.lib";
import { EXAM_PAPER_LIMIT, PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import type { ExamPaperFileKind } from "@/modules/exams/exams.type";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMATS = ["written", "multiple-choice", "practical", "oral", "project"] as const;

// Sửa ca thi (Phòng Khảo thí): ngày không rơi vào chủ nhật, đủ đúng số cán bộ coi thi, không ai trùng.
export const EXAM_SESSION_UPDATE_SCHEMA = z.object({
  id: z.uuid("Ca thi không hợp lệ"),
  date: z
    .string("Chưa chọn ngày")
    .regex(DATE, "Ngày không hợp lệ")
    .refine((value) => dayjs(value).isValid() && dayjs(value).day() !== 0, "Không xếp thi vào chủ nhật"),
  startTime: z.string("Chưa chọn giờ").regex(TIME, "Giờ không hợp lệ"),
  roomId: z.uuid("Chưa chọn phòng"),
  format: z.enum(FORMATS, "Chưa chọn hình thức"),
  proctorIds: z
    .array(z.uuid())
    .length(PROCTORS_PER_ROOM, `Mỗi phòng thi cần đúng ${PROCTORS_PER_ROOM} cán bộ coi thi`)
    .refine((ids) => new Set(ids).size === ids.length, "Một cán bộ chỉ được chọn một lần"),
});

export type ExamSessionUpdateInput = z.input<typeof EXAM_SESSION_UPDATE_SCHEMA>;

export const EXAM_PUBLISH_SCHEMA = z.object({
  termId: z.uuid(),
  kind: z.enum(["midterm", "final"]),
});

export type ExamPublishInput = z.input<typeof EXAM_PUBLISH_SCHEMA>;

const REASON = z.string("Chưa nhập lý do").trim().min(1, "Chưa nhập lý do").max(300, "Tối đa 300 ký tự");

export const ELIGIBILITY_OVERRIDE_SCHEMA = z.object({
  enrollmentId: z.uuid("Đăng ký học phần không hợp lệ"),
  reason: REASON,
});

export type EligibilityOverrideInput = z.input<typeof ELIGIBILITY_OVERRIDE_SCHEMA>;

export const EXAM_PAPER_SUBMIT_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
});

// Form nộp đề đi qua FormData: ô "examSessionId", tệp ở ô "paper" (đề thi) và "answer-key" (đáp án, thang điểm).
export function readExamPaperForm(formData: FormData) {
  const fileOf = (name: ExamPaperFileKind) => {
    const entry = formData.get(name);
    return entry !== null && typeof entry !== "string" ? entry : null;
  };
  return { input: { examSessionId: formData.get("examSessionId") }, files: { paper: fileOf("paper"), "answer-key": fileOf("answer-key") } };
}

export type ExamPaperUpload = { name: string; size: number; head: Uint8Array };

export type ExamPaperCheck =
  | { ok: true; files: Record<ExamPaperFileKind, { name: string; contentType: string }> }
  | { ok: false; fieldErrors: Partial<Record<ExamPaperFileKind, string>> };

// Đủ hai tệp, mỗi tệp là PDF thật (đuôi và chữ ký đầu tệp) không quá 20 MB. Báo lỗi riêng cho từng tệp.
export function checkExamPaperFiles(files: Record<ExamPaperFileKind, ExamPaperUpload | null>): ExamPaperCheck {
  const fieldErrors: Partial<Record<ExamPaperFileKind, string>> = {};
  const checked: Partial<Record<ExamPaperFileKind, { name: string; contentType: string }>> = {};
  for (const kind of ["paper", "answer-key"] as const) {
    const file = files[kind];
    if (!file) {
      fieldErrors[kind] = kind === "paper" ? "Chưa chọn tệp đề thi" : "Chưa chọn tệp đáp án, thang điểm";
      continue;
    }
    const result = checkUpload(file, { kinds: EXAM_PAPER_LIMIT.kinds, maxBytes: EXAM_PAPER_LIMIT.bytes });
    if (result.ok) checked[kind] = { name: result.name, contentType: result.contentType };
    else fieldErrors[kind] = result.message;
  }
  if (checked.paper && checked["answer-key"]) return { ok: true, files: { paper: checked.paper, "answer-key": checked["answer-key"] } };
  return { ok: false, fieldErrors };
}

export const PROCTOR_SWAP_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  colleagueId: z.uuid("Chọn người coi thay"),
  reason: REASON,
});

export type ProctorSwapInput = z.input<typeof PROCTOR_SWAP_SCHEMA>;

