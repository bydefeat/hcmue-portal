import { z } from "zod";
import { dayjs, schoolTime } from "@/shared/libs/date.lib";
import { checkUpload } from "@/shared/libs/upload.lib";
import { EXAM_PAPER_LIMIT, EXAM_RETURN_REASON_MAX, EXAM_START_TIMES, MAX_PROCTORS_PER_ROOM, PROCTORS_PER_ROOM } from "@/modules/exams/exams.constant";
import type { ExamConflict, ExamPaperFileKind, ExamPaperStatus, ExamSessionStatus } from "@/modules/exams/exams.type";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMATS = ["written", "multiple-choice", "practical", "oral", "project"] as const;

// Giờ bắt đầu thi (giờ Việt Nam) của ca.
export function examStartsAt(date: string, startTime: string) {
  return schoolTime(`${date}T${startTime.slice(0, 5)}`);
}

const REASON = z.string("Chưa nhập lý do").trim().min(1, "Chưa nhập lý do").max(300, "Tối đa 300 ký tự");

const OPTIONAL_REASON = z
  .string()
  .trim()
  .max(300, "Tối đa 300 ký tự")
  .nullish()
  .transform((value) => value || null);

const ROOM = z.object({
  roomId: z.uuid("Chưa chọn phòng"),
  proctorIds: z
    .array(z.uuid())
    .min(PROCTORS_PER_ROOM, `Mỗi phòng thi cần ít nhất ${PROCTORS_PER_ROOM} cán bộ coi thi`)
    .max(MAX_PROCTORS_PER_ROOM, `Mỗi phòng tối đa ${MAX_PROCTORS_PER_ROOM} cán bộ coi thi`),
});

// Ngày giờ, thời lượng, hạn nộp đề, phòng thi và cán bộ coi thi của một ca (dùng khi tạo và khi sửa). Ngày không rơi vào chủ
// nhật; giờ bắt đầu là một trong các ca thi của trường; hạn nộp đề trước giờ thi; một cán bộ chỉ coi một phòng.
const SLOT = z.object({
  date: z
    .string("Chưa chọn ngày")
    .regex(DATE, "Ngày không hợp lệ")
    .refine((value) => dayjs(value).isValid() && dayjs(value).day() !== 0, "Không xếp thi vào chủ nhật"),
  startTime: z.enum(EXAM_START_TIMES, "Chọn một giờ thi của trường"),
  durationMinutes: z.int("Nhập thời lượng").min(15, "Ít nhất 15 phút").max(240, "Tối đa 240 phút"),
  format: z.enum(FORMATS, "Chưa chọn hình thức"),
  paperDeadline: z.iso.datetime({ offset: true, message: "Hạn nộp đề không hợp lệ" }),
  rooms: z
    .array(ROOM)
    .min(1, "Chọn ít nhất một phòng thi")
    .max(12, "Tối đa 12 phòng một ca")
    .refine((rooms) => new Set(rooms.map((room) => room.roomId)).size === rooms.length, "Một phòng chỉ chọn một lần")
    .refine((rooms) => {
      const ids = rooms.flatMap((room) => room.proctorIds);
      return new Set(ids).size === ids.length;
    }, "Một cán bộ chỉ coi một phòng trong ca"),
  // Lý do khi vẫn lưu dù trùng lịch thi của sinh viên hoặc trùng giờ dạy của cán bộ coi thi (cảnh báo mềm).
  overrideReason: OPTIONAL_REASON,
});

function deadlineBeforeExam(value: { date: string; startTime: string; paperDeadline: string }, context: z.RefinementCtx) {
  if (!dayjs(value.paperDeadline).isBefore(examStartsAt(value.date, value.startTime))) {
    context.addIssue({ code: "custom", path: ["paperDeadline"], message: "Hạn nộp đề phải trước giờ thi" });
  }
}

export const EXAM_SESSION_UPDATE_SCHEMA = SLOT.extend({ id: z.uuid("Ca thi không hợp lệ") }).superRefine(deadlineBeforeExam);

export type ExamSessionUpdateInput = z.input<typeof EXAM_SESSION_UPDATE_SCHEMA>;

// Tạo ca: giữa kỳ, cuối kỳ cho cả lớp; ca thi bù trỏ về ca gốc và có danh sách đăng ký thi bù.
export const EXAM_SESSION_CREATE_SCHEMA = SLOT.extend({
  classSectionId: z.uuid("Chưa chọn lớp học phần"),
  kind: z.enum(["midterm", "final", "makeup"], "Chưa chọn loại ca thi"),
  makeupOfId: z.uuid("Chưa chọn ca gốc").nullish(),
  makeupEnrollmentIds: z.array(z.uuid()).max(200, "Tối đa 200 thí sinh").default([]),
}).superRefine((value, context) => {
  deadlineBeforeExam(value, context);
  if (value.kind !== "makeup") return;
  if (!value.makeupOfId) context.addIssue({ code: "custom", path: ["makeupOfId"], message: "Chọn ca gốc cần thi bù" });
  if (value.makeupEnrollmentIds.length === 0) context.addIssue({ code: "custom", path: ["makeupEnrollmentIds"], message: "Chọn ít nhất một sinh viên thi bù" });
});

export type ExamSessionCreateInput = z.input<typeof EXAM_SESSION_CREATE_SCHEMA>;

export const EXAM_SESSION_DELETE_SCHEMA = z.object({ id: z.uuid("Ca thi không hợp lệ"), reason: OPTIONAL_REASON });

// Sinh hàng loạt ca cuối kỳ cho các lớp mở chưa có ca: xếp vào các ngày trong khoảng, các giờ thi của trường.
export const EXAM_GENERATE_SCHEMA = z
  .object({
    termId: z.uuid(),
    fromDate: z.string("Chọn ngày bắt đầu").regex(DATE, "Ngày không hợp lệ"),
    toDate: z.string("Chọn ngày kết thúc").regex(DATE, "Ngày không hợp lệ"),
    durationMinutes: z.int("Nhập thời lượng").min(15, "Ít nhất 15 phút").max(240, "Tối đa 240 phút"),
    paperDaysBefore: z.int().min(1, "Ít nhất 1 ngày").max(30, "Tối đa 30 ngày").default(7),
  })
  .refine((value) => value.fromDate <= value.toDate, { path: ["toDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" })
  .refine((value) => dayjs(value.toDate).diff(dayjs(value.fromDate), "day") <= 42, { path: ["toDate"], message: "Đợt thi tối đa 6 tuần" });

export type ExamGenerateInput = z.input<typeof EXAM_GENERATE_SCHEMA>;

export const EXAM_PUBLISH_SCHEMA = z.object({
  termId: z.uuid(),
  kind: z.enum(["midterm", "final", "makeup"]),
});

export type ExamPublishInput = z.input<typeof EXAM_PUBLISH_SCHEMA>;

export const ELIGIBILITY_OVERRIDE_SCHEMA = z.object({
  enrollmentId: z.uuid("Đăng ký học phần không hợp lệ"),
  reason: REASON,
});

export type EligibilityOverrideInput = z.input<typeof ELIGIBILITY_OVERRIDE_SCHEMA>;

export const ELIGIBILITY_REVOKE_SCHEMA = z.object({
  enrollmentId: z.uuid("Đăng ký học phần không hợp lệ"),
  reason: REASON,
});

export type EligibilityRevokeInput = z.input<typeof ELIGIBILITY_REVOKE_SCHEMA>;

export const EXAM_DEFERRAL_SCHEMA = z.object({
  enrollmentId: z.uuid("Chọn sinh viên"),
  kind: z.enum(["midterm", "final"], "Chọn kỳ thi"),
  reason: REASON,
});

export type ExamDeferralInput = z.input<typeof EXAM_DEFERRAL_SCHEMA>;

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

// Duyệt đề kèm thời điểm nộp của bản người duyệt đã mở: giảng viên nộp lại trong lúc đó thì từ chối, người duyệt phải xem bản mới.
export const EXAM_PAPER_APPROVE_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  paperSubmittedAt: z.iso.datetime({ offset: true, message: "Thiếu phiên bản đề đã xem" }),
});

export type ExamPaperApproveInput = z.input<typeof EXAM_PAPER_APPROVE_SCHEMA>;

const RETURN_REASON = z
  .string("Chưa nhập lý do trả lại")
  .trim()
  .min(1, "Chưa nhập lý do trả lại")
  .max(EXAM_RETURN_REASON_MAX, `Tối đa ${EXAM_RETURN_REASON_MAX} ký tự`);

export const EXAM_PAPER_RETURN_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  paperSubmittedAt: z.iso.datetime({ offset: true, message: "Thiếu phiên bản đề đã xem" }).optional(),
  reason: RETURN_REASON,
});

export type ExamPaperReturnInput = z.input<typeof EXAM_PAPER_RETURN_SCHEMA>;

// Mở khóa đề đã duyệt khi phát hiện lỗi: đề chuyển sang "bị trả lại" kèm lý do, giảng viên nộp lại.
export const EXAM_PAPER_UNLOCK_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  reason: RETURN_REASON,
});

export type ExamPaperUnlockInput = z.input<typeof EXAM_PAPER_UNLOCK_SCHEMA>;

type PaperState = { status: ExamSessionStatus; paperStatus: ExamPaperStatus; hasStarted: boolean };

// Chỉ xét đề đang chờ duyệt (đã nộp hoặc vừa nộp lại) của ca chưa thi. Trả câu báo khi không xét được, null khi được.
export function paperReviewBlockedReason(exam: PaperState) {
  if (exam.status === "done" || exam.hasStarted) return "Ca thi đã diễn ra, không xét đề nữa.";
  if (exam.paperStatus === "not-submitted") return "Giảng viên chưa nộp đề.";
  if (exam.paperStatus === "approved") return "Đề đã được duyệt trước đó.";
  if (exam.paperStatus === "returned") return "Đề đã bị trả lại, đang chờ giảng viên nộp lại.";
  return null;
}

// Giảng viên nộp (lại) được khi ca chưa thi và đề chưa duyệt; đề bị trả lại thì nộp lại được.
export const PAPER_SUBMITTABLE_STATUSES = ["not-submitted", "submitted", "returned"] as const satisfies readonly ExamPaperStatus[];

// Câu báo khi giảng viên không nộp được đề, null khi được. Quá hạn nộp thì không nộp lần đầu hay thay bản đang chờ duyệt;
// đề bị trả lại thì vẫn nộp lại được tới giờ thi (Phòng Khảo thí đã trả lại, đang chờ bản sửa).
export function paperSubmitBlockedReason(exam: PaperState & { paperDeadline: string }, now = dayjs()) {
  if (exam.status === "done" || exam.hasStarted) return "Ca thi đã diễn ra, không nộp đề được nữa.";
  if (!(PAPER_SUBMITTABLE_STATUSES as readonly ExamPaperStatus[]).includes(exam.paperStatus)) return "Đề đã được duyệt nên đã khóa.";
  if (exam.paperStatus !== "returned" && now.isAfter(exam.paperDeadline)) return "Đã quá hạn nộp đề. Liên hệ Phòng Khảo thí để được gia hạn.";
  return null;
}

export function canSubmitPaper(exam: PaperState & { paperDeadline: string }, now = dayjs()) {
  return paperSubmitBlockedReason(exam, now) === null;
}

export const PROCTOR_SWAP_SCHEMA = z.object({
  examSessionId: z.uuid("Ca thi không hợp lệ"),
  colleagueId: z.uuid("Chọn người coi thay"),
  reason: REASON,
});

export type ProctorSwapInput = z.input<typeof PROCTOR_SWAP_SCHEMA>;

export const PROCTOR_SWAP_DECIDE_SCHEMA = z.object({
  id: z.uuid("Đề nghị không hợp lệ"),
  decision: z.enum(["accepted", "rejected"]),
  note: OPTIONAL_REASON,
});

export type ProctorSwapDecideInput = z.input<typeof PROCTOR_SWAP_DECIDE_SCHEMA>;

// --- Thời gian, xung đột ---

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export type TimeSlot = { date: string; startTime: string; durationMinutes: number };

// Hai khoảng thời gian cùng ngày chồng nhau (không tính chạm mép: ca 07:30-09:00 và 09:00-10:30 không trùng).
export function slotsOverlap(a: TimeSlot, b: TimeSlot) {
  if (a.date !== b.date) return false;
  const aStart = minutesOf(a.startTime);
  const bStart = minutesOf(b.startTime);
  return aStart < bStart + b.durationMinutes && bStart < aStart + a.durationMinutes;
}

export type ConflictSession = TimeSlot & {
  id: string;
  classCode: string;
  roomIds: string[];
  roomCodeOf?: Record<string, string>;
  proctors: { id: string; name: string }[];
};

// Xung đột của một ca với các ca khác trong học kỳ: trùng phòng, trùng cán bộ coi thi (chặn hẳn) và số sinh viên thi cả hai ca
// (cảnh báo mềm, sinh viên phải thi bù một trong hai). studentsShared[id] là số sinh viên chung với ca id.
export function examConflicts(target: ConflictSession, others: ConflictSession[], studentsShared: Record<string, number> = {}): ExamConflict[] {
  const conflicts: ExamConflict[] = [];
  for (const other of others) {
    if (other.id === target.id || !slotsOverlap(target, other)) continue;
    const sharedRoom = target.roomIds.find((roomId) => other.roomIds.includes(roomId));
    if (sharedRoom) conflicts.push({ kind: "room", isHard: true, message: `Trùng phòng ${target.roomCodeOf?.[sharedRoom] ?? ""} với ${other.classCode}`.replace("  ", " ") });
    const sharedProctor = target.proctors.find((proctor) => other.proctors.some((entry) => entry.id === proctor.id));
    if (sharedProctor) conflicts.push({ kind: "proctor", isHard: true, message: `${sharedProctor.name} coi thi trùng giờ với ${other.classCode}` });
    const shared = studentsShared[other.id] ?? 0;
    if (shared > 0) conflicts.push({ kind: "student", isHard: false, message: `${shared} sinh viên thi trùng giờ với ${other.classCode}` });
  }
  return conflicts;
}

// --- Chia thí sinh vào phòng ---

const givenName = (name: string) => name.trim().split(/\s+/).at(-1) ?? "";

// Tên người Việt xếp theo tên (chữ cuối), rồi họ đệm, rồi mã sinh viên.
export function byVietnameseName(a: { fullName: string; code: string }, b: { fullName: string; code: string }) {
  return givenName(a.fullName).localeCompare(givenName(b.fullName), "vi") || a.fullName.localeCompare(b.fullName, "vi") || a.code.localeCompare(b.code);
}

// Xếp thí sinh (đã theo thứ tự) lần lượt vào các phòng theo sức chứa thi; số báo danh đánh liên tục từ 1. Thiếu chỗ thì trả số
// người chưa có chỗ (không xếp ai).
export function assignCandidates<T>(candidates: T[], rooms: { id: string; examCapacity: number }[]) {
  const capacity = rooms.reduce((sum, room) => sum + room.examCapacity, 0);
  if (candidates.length > capacity) return { ok: false as const, shortfall: candidates.length - capacity, capacity };
  // Chia đều để các phòng không lệch nhau quá nhiều (phòng sau không chỉ còn vài người), nhưng không vượt sức chứa từng phòng.
  const assigned: { candidate: T; roomId: string; candidateNumber: number }[] = [];
  let remaining = candidates.length;
  let remainingCapacity = capacity;
  let index = 0;
  for (const room of rooms) {
    const share = remainingCapacity === 0 ? 0 : Math.min(room.examCapacity, Math.ceil((remaining * room.examCapacity) / remainingCapacity));
    for (let seat = 0; seat < share && index < candidates.length; seat += 1) {
      assigned.push({ candidate: candidates[index], roomId: room.id, candidateNumber: index + 1 });
      index += 1;
    }
    remaining = candidates.length - index;
    remainingCapacity -= room.examCapacity;
  }
  return { ok: true as const, assigned, capacity };
}

// --- Điều kiện dự thi ---

// Cấm thi khi số tiết vắng (gồm vắng có phép) VƯỢT QUÁ ngưỡng phần trăm trên tổng số tiết kế hoạch của học phần. Tính trên tổng
// kế hoạch nên đầu học kỳ vắng vài buổi chưa bị kết luận cấm thi.
export function isBannedFromExam(absentPeriods: number, plannedPeriods: number, limitPercent: number) {
  return plannedPeriods > 0 && absentPeriods * 100 > limitPercent * plannedPeriods;
}

// Vắng thêm ngần này tiết nữa thì bị cấm thi (0 là đã bị cấm), để cảnh báo sớm.
export function periodsLeftBeforeBan(absentPeriods: number, plannedPeriods: number, limitPercent: number) {
  if (plannedPeriods <= 0) return null;
  const allowed = Math.floor((limitPercent * plannedPeriods) / 100);
  return Math.max(0, allowed - absentPeriods + 1);
}
