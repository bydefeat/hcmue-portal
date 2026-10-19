import { z } from "zod";
import { dayjs } from "@/shared/libs/date.lib";
import { PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";

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

const PDF_NAME = z
  .string("Chưa chọn tệp")
  .trim()
  .min(1, "Chưa chọn tệp")
  .max(200, "Tên tệp quá dài")
  .refine((name) => name.toLowerCase().endsWith(".pdf"), "Chỉ nhận tệp PDF");

export const EXAM_PAPER_SUBMIT_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  paperFileName: PDF_NAME,
  keyFileName: PDF_NAME,
});

export type ExamPaperSubmitInput = z.input<typeof EXAM_PAPER_SUBMIT_SCHEMA>;

export const PROCTOR_SWAP_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  colleagueId: z.uuid("Chọn người coi thay"),
  reason: REASON,
});

export type ProctorSwapInput = z.input<typeof PROCTOR_SWAP_SCHEMA>;

// Khóa lưu đề thi: mỗi lần nộp một khóa mới để bản cũ không bị ghi đè trước khi Phòng Khảo thí duyệt.
export function examPaperStorageKey(examSessionId: string, submissionId: string) {
  return `exam-papers/${examSessionId}/${submissionId}`;
}
