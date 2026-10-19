import { z } from "zod";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import {
  ATTACHMENT_LIMIT,
  REQUEST_KINDS,
  STUDENT_REQUEST_FIELDS,
  STUDENT_REQUEST_KINDS,
  type RequestFieldSpec,
} from "@/modules/requests/requests.constant";
import type { RequestDetail, RequestKind, StepRole, StepStatus } from "@/modules/requests/requests.type";

const reason = (max: number) => z.string("Chưa nhập lý do").trim().min(1, "Chưa nhập lý do").max(max, `Tối đa ${max} ký tự`);

// Chưa có kho lưu tệp nên chỉ nhận tên, kích thước, kiểu tệp. DB còn chặn kích thước bằng request_attachments_size_range.
export const ATTACHMENT_SCHEMA = z.object({
  name: z.string().trim().min(1, "Tệp không có tên").max(255, "Tên tệp tối đa 255 ký tự"),
  size: z.int().min(1, "Tệp rỗng, chọn tệp khác").max(ATTACHMENT_LIMIT.bytes, "Mỗi tệp không quá 5 MB"),
  type: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || "application/octet-stream"),
});

const attachments = z.array(ATTACHMENT_SCHEMA).max(ATTACHMENT_LIMIT.files, `Tối đa ${ATTACHMENT_LIMIT.files} tệp`).default([]);

export type AttachmentInput = z.input<typeof ATTACHMENT_SCHEMA>;

function fieldSchema(field: RequestFieldSpec) {
  const label = field.label.toLowerCase();
  if (field.kind === "number") {
    const min = field.min ?? 0;
    const max = field.max ?? Number.MAX_SAFE_INTEGER;
    return z
      .number(`Chưa nhập ${label}`)
      .min(min, `Ít nhất ${String(min).replace(".", ",")}`)
      .max(max, `Tối đa ${String(max).replace(".", ",")}`)
      .multipleOf(field.step ?? 1, `Bước nhập là ${String(field.step ?? 1).replace(".", ",")}`);
  }
  if (field.kind === "section") return z.uuid(`Chưa chọn ${label}`);
  if (field.kind === "date") return z.iso.date(`Chưa chọn ${label}`);
  if (field.kind === "select") return z.enum(field.options as [string, ...string[]], `Chưa chọn ${label}`);
  return z.string(`Chưa nhập ${label}`).trim().min(1, `Chưa nhập ${label}`).max(200, "Tối đa 200 ký tự");
}

// Thông tin riêng của từng loại đơn nằm phẳng cùng cấp với kind để lỗi gắn đúng ô của form. Kiểm từng ô trong transform để
// báo lỗi mọi ô cùng lúc (zod dừng ở object gốc nếu để lý do, tệp ở object ngoài).
export const STUDENT_REQUEST_SCHEMA = z
  .looseObject({ kind: z.enum(STUDENT_REQUEST_KINDS as [RequestKind, ...RequestKind[]], "Chưa chọn loại đơn") })
  .transform((input, context) => {
    const take = <T>(schema: z.ZodType<T>, key: string) => {
      const parsed = schema.safeParse(input[key]);
      if (parsed.success) return parsed.data;
      for (const issue of parsed.error.issues) context.issues.push({ code: "custom", path: [key, ...issue.path], message: issue.message, input: input[key] });
      return undefined;
    };
    const fields: Record<string, string | number> = {};
    for (const field of STUDENT_REQUEST_FIELDS[input.kind]) {
      const value = take<string | number>(fieldSchema(field), field.name);
      if (value !== undefined) fields[field.name] = value;
    }
    return { kind: input.kind, reason: take(reason(1000), "reason") ?? "", attachments: take(attachments, "attachments") ?? [], fields };
  });

export type StudentRequestInput = z.input<typeof STUDENT_REQUEST_SCHEMA>;
export type StudentRequestValues = z.output<typeof STUDENT_REQUEST_SCHEMA>;

const score = (message: string) => z.number(message).min(0, "Điểm từ 0 đến 10").max(10, "Điểm từ 0 đến 10");

const GRADE_CHANGE_SCHEMA = z
  .object({
    kind: z.literal("grade-change"),
    classId: z.uuid("Chưa chọn lớp"),
    studentId: z.uuid("Chưa chọn sinh viên"),
    componentKey: z.string("Chưa chọn cột điểm").trim().min(1, "Chưa chọn cột điểm").max(50),
    componentLabel: z.string().trim().min(1, "Chưa chọn cột điểm").max(100),
    oldScore: score("Điểm hiện tại không hợp lệ").nullable(),
    newScore: score("Chưa nhập điểm mới").multipleOf(0.01, "Tối đa 2 chữ số thập phân"),
    reason: reason(500),
    attachments,
  })
  .refine((input) => input.oldScore === null || input.newScore !== input.oldScore, { path: ["newScore"], message: "Điểm mới trùng điểm hiện tại" });

const period = (message: string) => z.int(message).min(1, message).max(12, message);

const TEACHING_LEAVE_SCHEMA = z
  .object({
    kind: z.literal("teaching-leave"),
    classId: z.uuid("Chưa chọn lớp"),
    sessionDate: z.string("Chưa chọn buổi nghỉ").regex(/^\d{4}-\d{2}-\d{2}\|\d{1,2}$/, "Chưa chọn buổi nghỉ"),
    makeupDay: z.int("Chọn thứ").min(2, "Chọn thứ").max(8, "Chọn thứ"),
    makeupStart: period("Chọn tiết"),
    makeupEnd: period("Chọn tiết"),
    makeupRoom: z.string("Chọn phòng").trim().min(1, "Chọn phòng").max(20),
    reason: reason(500),
    attachments,
  })
  .refine((input) => input.makeupEnd >= input.makeupStart, { path: ["makeupEnd"], message: "Tiết kết thúc đứng trước tiết bắt đầu" });

export const LECTURER_REQUEST_SCHEMA = z.discriminatedUnion("kind", [GRADE_CHANGE_SCHEMA, TEACHING_LEAVE_SCHEMA]);

export type LecturerRequestInput = z.input<typeof LECTURER_REQUEST_SCHEMA>;
export type LecturerRequestValues = z.output<typeof LECTURER_REQUEST_SCHEMA>;

export const DECIDE_STEP_SCHEMA = z
  .object({
    step: z.int().min(0),
    decision: z.enum(["approved", "rejected"]),
    comment: z.string().trim().max(500, "Tối đa 500 ký tự"),
  })
  .refine((input) => input.decision === "approved" || input.comment.length > 0, {
    path: ["comment"],
    message: "Ghi lý do không đồng ý để người gửi biết cần bổ sung gì",
  });

export type DecideStepInput = z.input<typeof DECIDE_STEP_SCHEMA>;

export function formatRequestCode(prefix: string, year: number, value: number) {
  return `${prefix}-${year}-${String(value).padStart(5, "0")}`;
}

function numberText(value: number) {
  return String(value).replace(".", ",");
}

// Phần chi tiết và nội dung của đơn sinh viên ghép ở server từ giá trị đã kiểm, lớp học phần tra từ DB.
export function studentRequestContent(values: Pick<StudentRequestValues, "kind" | "fields">, sectionLabel: string | null) {
  const specs = STUDENT_REQUEST_FIELDS[values.kind];
  const textOf = (field: RequestFieldSpec) => {
    const value = values.fields[field.name];
    if (value === undefined || value === "") return "";
    if (field.kind === "section") return sectionLabel ?? "";
    if (field.kind === "date") return formatDate(String(value));
    return typeof value === "number" ? numberText(value) : value;
  };
  const details: RequestDetail[] = specs.map((field) => ({ label: field.label, value: textOf(field) })).filter((detail) => detail.value);
  const subjectField = specs.find((field) => field.kind === "section" || field.name === "course");
  return { details, subject: subjectField ? textOf(subjectField) : REQUEST_KINDS[values.kind].label };
}

export function sessionLabel(date: string, meeting: { dayOfWeek: number; startPeriod: number; endPeriod: number; room: string }) {
  return `${weekdayLabel(meeting.dayOfWeek)}, ${formatDate(date)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)}, phòng ${meeting.room}`;
}

export function makeupLabel(input: { makeupDay: number; makeupStart: number; makeupEnd: number; makeupRoom: string }) {
  return `${weekdayLabel(input.makeupDay)}, ${periodLabel(input.makeupStart, input.makeupEnd)} (${periodTimeRange(input.makeupStart, input.makeupEnd)}), đề xuất phòng ${input.makeupRoom}`;
}

export function scoreText(value: number | null) {
  return value === null ? "Chưa có" : value.toFixed(2).replace(".", ",");
}

type StepRow = { position: number; role: StepRole; label: string; status: StepStatus; dueAt: Date | null; assigneeLecturerId: string | null };

// Bước đầu tiên đến lượt ngay khi gửi, hạn xử lý tính từ lúc đến lượt.
export function initialSteps(kind: RequestKind, now: Date, lecturerId: string | null): StepRow[] {
  return REQUEST_KINDS[kind].steps.map((template, index) => ({
    position: index + 1,
    role: template.role,
    label: template.label,
    status: index === 0 ? "pending" : "waiting",
    dueAt: index === 0 ? dayjs(now).add(template.slaDays, "day").toDate() : null,
    assigneeLecturerId: template.role === "lecturer" ? lecturerId : null,
  }));
}

export type DecisionPlan = { ok: true; next: { index: number; dueAt: Date } | null } | { ok: false; message: string };

// Chuyển bước: chỉ bước đang chờ, đúng bước người duyệt đang xem, các bước trước đã xong. Đồng ý thì bước sau đến lượt.
export function planDecision(input: {
  kind: RequestKind;
  cancelled: boolean;
  statuses: StepStatus[];
  step: number;
  decision: "approved" | "rejected";
  now: Date;
}): DecisionPlan {
  const { statuses } = input;
  if (input.cancelled) return { ok: false, message: "Người gửi đã hủy đơn, không xử lý tiếp." };
  const current = statuses.indexOf("pending");
  if (current < 0) {
    return {
      ok: false,
      message: statuses.includes("rejected") ? "Đơn đã bị từ chối, không xử lý tiếp." : "Đơn đã duyệt xong, không xử lý tiếp.",
    };
  }
  if (current !== input.step) return { ok: false, message: "Bước này đã được người khác xử lý. Tải lại trang để xem tiến độ mới." };
  if (!statuses.slice(0, current).every((status) => status === "approved" || status === "skipped")) {
    return { ok: false, message: "Các bước trước chưa duyệt xong, chưa đến lượt bước này." };
  }
  if (input.decision === "rejected" || current === statuses.length - 1) return { ok: true, next: null };
  const slaDays = REQUEST_KINDS[input.kind].steps[current + 1]?.slaDays ?? 3;
  return { ok: true, next: { index: current + 1, dueAt: dayjs(input.now).add(slaDays, "day").toDate() } };
}

// Chỉ hủy được khi chưa bước nào xử lý: đơn đã được tiếp nhận thì người gửi liên hệ đơn vị đang xử lý.
export function cancelBlockedReason(cancelled: boolean, statuses: StepStatus[]) {
  if (cancelled) return "Đơn đã hủy trước đó.";
  if (statuses.some((status) => status === "approved" || status === "rejected")) {
    return "Đơn đã được tiếp nhận xử lý nên không hủy được nữa. Liên hệ đơn vị đang xử lý nếu cần dừng.";
  }
  return null;
}
