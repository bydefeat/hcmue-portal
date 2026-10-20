import { z } from "zod";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import { dayjs, formatDate, schoolTime } from "@/shared/libs/date.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { checkUpload, formatFileSize } from "@/shared/libs/upload.lib";
import {
  ATTACHMENT_LIMIT,
  isOfficeStep,
  REQUEST_KINDS,
  STEP_ROLE_LABEL,
  STUDENT_REQUEST_FIELDS,
  STUDENT_REQUEST_KINDS,
  type OfficeStepRole,
  type RequestFieldSpec,
} from "@/modules/requests/requests.constant";
import type { RequestDetail, RequestKind, RequestRules, StepRole, StepStatus } from "@/modules/requests/requests.type";

const reason = (max: number) => z.string("Chưa nhập lý do").trim().min(1, "Chưa nhập lý do").max(max, `Tối đa ${max} ký tự`);

export type AttachmentUpload = { name: string; size: number; head: Uint8Array };

export type AttachmentCheck = { ok: true; files: { name: string; contentType: string }[] } | { ok: false; message: string };

// Minh chứng gửi kèm đơn: đúng loại tệp cho phép (đuôi và chữ ký đầu tệp), từng tệp và cả đơn không quá giới hạn.
// Kiểu tệp lưu xuống lấy theo nội dung tệp, không theo kiểu trình duyệt gửi.
export function checkAttachments(files: AttachmentUpload[]): AttachmentCheck {
  if (files.length > ATTACHMENT_LIMIT.files) return { ok: false, message: `Tối đa ${ATTACHMENT_LIMIT.files} tệp minh chứng.` };
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > ATTACHMENT_LIMIT.totalBytes) {
    return { ok: false, message: `Tổng dung lượng minh chứng ${formatFileSize(total)}, tối đa ${formatFileSize(ATTACHMENT_LIMIT.totalBytes)} mỗi đơn.` };
  }
  const checked: { name: string; contentType: string }[] = [];
  for (const file of files) {
    const result = checkUpload(file, { kinds: ATTACHMENT_LIMIT.kinds, maxBytes: ATTACHMENT_LIMIT.bytes });
    if (!result.ok) return result;
    checked.push({ name: result.name, contentType: result.contentType });
  }
  return { ok: true, files: checked };
}

// Form gửi đơn đi qua FormData để mang được tệp: phần dữ liệu là JSON ở ô "input", tệp ở các ô "files".
export function readRequestForm(formData: FormData): { input: unknown; files: File[] } {
  const raw = formData.get("input");
  let input: unknown = null;
  try {
    input = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    input = null;
  }
  const files = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string");
  return { input, files };
}

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
// báo lỗi mọi ô cùng lúc (zod dừng ở object gốc nếu để lý do ở object ngoài). Tệp minh chứng kiểm riêng bằng checkAttachments.
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
    return { kind: input.kind, reason: take(reason(1000), "reason") ?? "", fields };
  });

export type StudentRequestInput = z.input<typeof STUDENT_REQUEST_SCHEMA>;
export type StudentRequestValues = z.output<typeof STUDENT_REQUEST_SCHEMA>;

const score = (message: string) => z.number(message).min(0, "Điểm từ 0 đến 10").max(10, "Điểm từ 0 đến 10");

// Nhãn cột điểm và điểm hiện tại không nhận từ client: server đọc từ bảng điểm của lớp (xem gradeChangeBlockedReason).
const GRADE_CHANGE_SCHEMA = z.object({
  kind: z.literal("grade-change"),
  classId: z.uuid("Chưa chọn lớp"),
  studentId: z.uuid("Chưa chọn sinh viên"),
  componentKey: z.string("Chưa chọn cột điểm").trim().min(1, "Chưa chọn cột điểm").max(50),
  newScore: score("Chưa nhập điểm mới").multipleOf(0.01, "Tối đa 2 chữ số thập phân"),
  reason: reason(500),
});

// Đơn sửa điểm: cột điểm phải có trong bảng điểm của lớp, điểm mới khác điểm đang lưu.
export function gradeChangeBlockedReason(component: { label: string } | null, oldScore: number | null, newScore: number) {
  if (!component) return { field: "componentKey", message: "Lớp chưa có cột điểm này trong bảng điểm. Tải lại trang." };
  if (oldScore !== null && oldScore === newScore) return { field: "newScore", message: "Điểm mới trùng điểm hiện tại" };
  return null;
}

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
    // Phần nhập kèm khi duyệt bước cuối (điểm sau phúc khảo...), handler kết quả đơn kiểm bằng schema riêng.
    effect: z.record(z.string(), z.unknown()).optional(),
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

// Dữ liệu hệ thống đặt cạnh giá trị sinh viên tự khai để người duyệt đối chiếu (điểm thi, lịch thi của lớp).
export type StudentRequestFacts = {
  // Cột điểm cuối kỳ của lớp và điểm của sinh viên; null là không xác định được cột cuối kỳ (xem pickFinalComponent).
  finalExam?: { label: string; score: number | null } | null;
  examDates?: { kind: "midterm" | "final"; date: string }[];
};

// Phần chi tiết và nội dung của đơn sinh viên ghép ở server từ giá trị đã kiểm, lớp học phần tra từ DB. Ô sinh viên tự khai
// (điểm thi, ngày thi) ghi rõ nhãn "sinh viên khai", kèm giá trị trên hệ thống ngay sau.
export function studentRequestContent(values: Pick<StudentRequestValues, "kind" | "fields">, sectionLabel: string | null, facts: StudentRequestFacts = {}) {
  const specs = STUDENT_REQUEST_FIELDS[values.kind];
  const textOf = (field: RequestFieldSpec) => {
    const value = values.fields[field.name];
    if (value === undefined || value === "") return "";
    if (field.kind === "section") return sectionLabel ?? "";
    if (field.kind === "date") return formatDate(String(value));
    return typeof value === "number" ? numberText(value) : value;
  };
  const details: RequestDetail[] = specs
    .map((field) => ({ label: field.declared ? `${field.label} (sinh viên khai)` : field.label, value: textOf(field) }))
    .filter((detail) => detail.value);
  if (facts.finalExam !== undefined) {
    details.push(
      facts.finalExam === null
        ? { label: "Điểm thi cuối kỳ trên hệ thống", value: "Không xác định (bảng điểm lớp không có cột cuối kỳ rõ ràng)" }
        : { label: `Điểm ${facts.finalExam.label.toLowerCase()} trên hệ thống`, value: facts.finalExam.score === null ? "Chưa có" : numberText(facts.finalExam.score) },
    );
  }
  if (facts.examDates !== undefined) {
    details.push({
      label: "Lịch thi trên hệ thống",
      value: facts.examDates.length === 0 ? "Chưa có" : facts.examDates.map((exam) => `${exam.kind === "midterm" ? "Giữa kỳ" : "Cuối kỳ"} ${formatDate(exam.date)}`).join(", "),
    });
  }
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

// Hạn xử lý tính theo ngày làm việc: bỏ thứ 7, chủ nhật và ngày nghỉ lễ (lịch năm học, loại "Nghỉ lễ"), giữ nguyên giờ trong ngày.
// holidays là tập ngày "YYYY-MM-DD" theo giờ Việt Nam.
export function addWorkingDays(start: Date, days: number, holidays: ReadonlySet<string> = new Set()) {
  let cursor = schoolTime(start);
  let left = days;
  while (left > 0) {
    cursor = cursor.add(1, "day");
    const weekday = cursor.day();
    if (weekday === 0 || weekday === 6 || holidays.has(cursor.format("YYYY-MM-DD"))) continue;
    left -= 1;
  }
  return cursor.toDate();
}

// Ngày nghỉ lễ từ các mốc lịch năm học (một mốc có thể kéo dài nhiều ngày).
export function holidayDates(events: { startDate: string; endDate: string }[]) {
  const dates = new Set<string>();
  for (const event of events) {
    for (let day = dayjs(event.startDate); !day.isAfter(event.endDate, "day"); day = day.add(1, "day")) dates.add(day.format("YYYY-MM-DD"));
  }
  return dates;
}

type StepRow = { position: number; role: StepRole; label: string; status: StepStatus; dueAt: Date | null; assigneeLecturerId: string | null };

// Bước đầu tiên đến lượt ngay khi gửi, hạn xử lý tính từ lúc đến lượt. Bước cố vấn không lưu người xử lý (đi theo cố vấn hiện tại).
export function initialSteps(kind: RequestKind, now: Date, lecturerId: string | null, holidays: ReadonlySet<string> = new Set()): StepRow[] {
  return REQUEST_KINDS[kind].steps.map((template, index) => ({
    position: index + 1,
    role: template.role,
    label: template.label,
    status: index === 0 ? "pending" : "waiting",
    dueAt: index === 0 ? addWorkingDays(now, template.slaDays, holidays) : null,
    assigneeLecturerId: template.role === "lecturer" ? lecturerId : null,
  }));
}

export type DecisionPlan = { ok: true; next: { index: number; dueAt: Date } | null } | { ok: false; message: string };

// Chuyển bước: chỉ bước đang chờ, đúng bước người duyệt đang xem, các bước trước đã xong. Đồng ý (hoặc bỏ qua) thì bước sau đến lượt.
export function planDecision(input: {
  kind: RequestKind;
  cancelled: boolean;
  statuses: StepStatus[];
  step: number;
  decision: "approved" | "rejected" | "skipped";
  now: Date;
  holidays?: ReadonlySet<string>;
  // Đang chờ người gửi bổ sung minh chứng.
  awaitingSupplement?: boolean;
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
  if (input.awaitingSupplement) return { ok: false, message: "Đơn đang chờ người gửi bổ sung minh chứng, chưa xử lý tiếp được." };
  if (input.decision === "rejected" || current === statuses.length - 1) return { ok: true, next: null };
  const slaDays = REQUEST_KINDS[input.kind].steps[current + 1]?.slaDays ?? 3;
  return { ok: true, next: { index: current + 1, dueAt: addWorkingDays(input.now, slaDays, input.holidays) } };
}

// Chỉ hủy được khi chưa bước nào xử lý: đơn đã được tiếp nhận thì người gửi liên hệ đơn vị đang xử lý.
export function cancelBlockedReason(cancelled: boolean, statuses: StepStatus[]) {
  if (cancelled) return "Đơn đã hủy trước đó.";
  if (statuses.some((status) => status === "approved" || status === "rejected" || status === "skipped")) {
    return "Đơn đã được tiếp nhận xử lý nên không hủy được nữa. Liên hệ đơn vị đang xử lý nếu cần dừng.";
  }
  return null;
}

export type AssigneeStep = { role: StepRole; status: StepStatus; assigneeLecturerId: string | null; reassignedAt: Date | string | null };

// Giảng viên đang chịu trách nhiệm một bước cố vấn hoặc giảng viên. Bước đã xử lý giữ người lúc xử lý; bước được Phòng Đào tạo
// chuyển giữ người được chuyển; còn lại đi theo cố vấn hiện tại của lớp sinh hoạt, giảng viên hiện tại của lớp học phần, nên
// đổi cố vấn, đổi giảng viên lớp thì bước đang chờ tự sang người mới. Cùng logic với điều kiện SQL trong requests.query.
export function effectiveAssignee(step: AssigneeStep, context: { advisorId: string | null; sectionLecturerId: string | null }) {
  if (step.role !== "advisor" && step.role !== "lecturer") return null;
  if (step.status === "approved" || step.status === "rejected" || step.status === "skipped" || step.reassignedAt) return step.assigneeLecturerId;
  if (step.role === "advisor") return context.advisorId;
  return context.sectionLecturerId ?? step.assigneeLecturerId;
}

// Người đang xem đơn: tài khoản, giảng viên (cổng giảng viên) và vai trò quản trị đang dùng (cổng quản trị).
export type RequestAccess = {
  userId: string;
  lecturerId: string | null;
  office: { roles: OfficeStepRole[]; faculty: string | null; supervise: boolean; roleName: string } | null;
};

export type StepContext = {
  role: StepRole;
  assigneeLecturerId: string | null;
  faculty: string;
  advisorId: string | null;
};

// Một hàm quyền cho mọi nơi xử lý bước: trả câu báo nếu người này không xử lý được bước, null nếu được.
// portal "lecturer": bước cố vấn, giảng viên giao cho chính giảng viên đó; "office": bước của khoa, phòng theo quyền requests.step.*
// trong phạm vi khoa của vai trò.
export function stepDeniedReason(access: RequestAccess, portal: "lecturer" | "office", step: StepContext): string | null {
  if (portal === "lecturer") {
    if (!access.lecturerId) return "Chỉ giảng viên xử lý được bước này ở cổng giảng viên.";
    if (step.role === "advisor") return step.assigneeLecturerId === access.lecturerId ? null : "Bạn không phải người xử lý bước cố vấn của đơn này.";
    if (step.role === "lecturer") return step.assigneeLecturerId === access.lecturerId ? null : "Bước này giao cho giảng viên khác.";
    return `Bước này do ${STEP_ROLE_LABEL[step.role]} xử lý, không xử lý ở cổng giảng viên.`;
  }
  if (!access.office) return "Bạn chưa được phân quyền xử lý đơn từ.";
  if (!isOfficeStep(step.role)) return `Bước này do ${STEP_ROLE_LABEL[step.role].toLowerCase()} xử lý ở cổng giảng viên.`;
  if (!access.office.roles.includes(step.role)) return `Bước này do ${STEP_ROLE_LABEL[step.role]} xử lý, vai trò ${access.office.roleName} không xử lý được.`;
  if (access.office.faculty !== null && access.office.faculty !== step.faculty) return `Đơn thuộc ${step.faculty}, ngoài phạm vi vai trò của bạn.`;
  return null;
}

// Phòng Đào tạo chuyển người xử lý, xử lý thay: quyền requests.supervise trong phạm vi khoa của vai trò.
export function superviseDeniedReason(access: RequestAccess, faculty: string): string | null {
  if (!access.office?.supervise) return "Vai trò của bạn không có quyền chuyển người xử lý hay xử lý thay bước đơn.";
  if (access.office.faculty !== null && access.office.faculty !== faculty) return `Đơn thuộc ${faculty}, ngoài phạm vi vai trò của bạn.`;
  return null;
}

// Chọn cột điểm cuối kỳ trong bảng điểm của lớp: khóa "final" hoặc nhãn có chữ "cuối kỳ"/"thi". Không thấy hoặc có nhiều cột
// cùng khớp mà không phân định được thì trả null để đơn ghi "không xác định" thay vì đoán sai.
export function pickFinalComponent<T extends { key: string; label: string }>(components: T[]): T | null {
  const byKey = components.filter((component) => component.key === "final");
  if (byKey.length === 1) return byKey[0];
  const label = (component: T) => normalizeSearch(component.label);
  const finals = components.filter((component) => /cuoi ky|thi ket thuc|final/.test(label(component)));
  if (finals.length === 1) return finals[0];
  const exams = components.filter((component) => /\bthi\b/.test(label(component)) && !/giua ky/.test(label(component)));
  return exams.length === 1 ? exams[0] : null;
}

// Phúc khảo: chỉ khi bảng điểm lớp đã công bố và còn trong số ngày quy chế cho phép kể từ ngày công bố.
export function regradeBlockedReason(sheet: { status: string; publishedAt: Date | null } | null, now: Date, windowDays: number) {
  if (!sheet || sheet.status !== "published" || !sheet.publishedAt) return "Lớp chưa công bố điểm nên chưa nhận đơn phúc khảo.";
  const closesAt = dayjs(sheet.publishedAt).add(windowDays, "day");
  if (dayjs(now).isAfter(closesAt)) {
    return `Đã quá hạn phúc khảo: nhận đơn trong ${windowDays} ngày kể từ ngày công bố điểm ${formatDate(sheet.publishedAt)}.`;
  }
  return null;
}

// Sửa điểm sau khi chốt: bảng điểm phải đã chốt, đã duyệt hoặc đã công bố. Nháp, bị trả lại thì giảng viên sửa thẳng trên bảng điểm.
export function gradeChangeSheetBlockedReason(status: string | null) {
  if (status === "locked" || status === "approved" || status === "published") return null;
  return "Bảng điểm của lớp chưa chốt, sửa trực tiếp trên trang nhập điểm.";
}

// Học vượt: CPA từ ngưỡng của quy chế, số tín chỉ xin đăng ký vượt hạn mức tối đa mỗi học kỳ, không quá phần thêm của quy chế.
export function overloadBounds(rules: Pick<RequestRules, "maxPerTerm" | "overloadExtraCredits">) {
  return { min: rules.maxPerTerm + 1, max: rules.maxPerTerm + rules.overloadExtraCredits };
}

export function overloadBlockedReason(input: { credits: number; cpa4: number }, rules: Pick<RequestRules, "maxPerTerm" | "overloadMinCpa" | "overloadExtraCredits">) {
  if (input.cpa4 < rules.overloadMinCpa) {
    return { field: "kind", message: `CPA hiện tại ${numberText(Number(input.cpa4.toFixed(2)))} dưới ngưỡng ${numberText(rules.overloadMinCpa)} nên chưa đủ điều kiện học vượt tín chỉ.` };
  }
  const bounds = overloadBounds(rules);
  if (input.credits < bounds.min || input.credits > bounds.max) {
    return { field: "credits", message: `Học vượt từ ${bounds.min} đến ${bounds.max} tín chỉ (hạn mức thường là ${rules.maxPerTerm}).` };
  }
  return null;
}

// Mô tả từng loại đơn, số liệu lấy từ quy chế đang áp dụng.
export function requestKindDescription(kind: RequestKind, rules?: RequestRules) {
  switch (kind) {
    case "overload":
      return rules
        ? `Đăng ký quá hạn mức ${rules.maxPerTerm} tín chỉ trong học kỳ. Chỉ xét cho sinh viên có CPA từ ${numberText(rules.overloadMinCpa)}.`
        : "Đăng ký quá hạn mức tín chỉ của học kỳ, xét theo CPA tối thiểu của quy chế.";
    case "withdraw":
      return "Rút học phần sau đợt điều chỉnh, học phần nhận điểm W và vẫn tính học phí.";
    case "open-class":
      return "Đề nghị mở thêm lớp khi lớp hiện có đã đủ chỗ hoặc học phần chưa mở trong kỳ.";
    case "regrade":
      return `Chấm lại bài thi cuối kỳ. Nộp trong ${rules ? `${rules.regradeWindowDays} ngày` : "thời hạn của quy chế"} kể từ ngày công bố điểm của lớp.`;
    case "exam-postpone":
      return "Vắng thi có lý do chính đáng, bắt buộc kèm minh chứng. Được thi ở đợt thi kế tiếp.";
    case "reserve":
      return `Tạm dừng học, giữ nguyên kết quả đã tích lũy, tổng thời gian bảo lưu ${rules ? `tối đa ${rules.maxReserveTerms} học kỳ` : "theo quy chế đào tạo"}. Kèm minh chứng lý do.`;
    case "transcript":
      return "Bảng điểm có đóng dấu, nhận tại Phòng Đào tạo hoặc gửi bản điện tử.";
    case "credit-transfer":
      return "Công nhận học phần đã học ở trường khác hoặc ngành khác. Khoa đối chiếu đề cương; kèm bảng điểm, đề cương làm minh chứng.";
    case "grade-change":
      return "Điều chỉnh điểm đã chốt do nhập sai hoặc sau phúc khảo, bắt buộc kèm minh chứng.";
    case "teaching-leave":
      return "Báo nghỉ một buổi dạy và đăng ký lịch dạy bù.";
  }
}

// Loại đơn bắt buộc có minh chứng (hoãn thi, sửa điểm...): kiểm ở server, tính cả tệp kế thừa khi gửi lại đơn.
export function missingAttachmentReason(kind: RequestKind, fileCount: number) {
  return REQUEST_KINDS[kind].attachmentsRequired && fileCount === 0 ? `${REQUEST_KINDS[kind].label} bắt buộc kèm ít nhất một tệp minh chứng.` : null;
}

// Nhắc hạn bước đang chờ: sắp hết hạn (còn dưới REQUEST_DUE_SOON_HOURS giờ) hoặc đã quá hạn; mỗi loại nhắc một lần cho mỗi lượt.
export const REQUEST_DUE_SOON_HOURS = 24;

export function slaNotice(step: { dueAt: Date; dueSoonNotifiedAt: Date | null; overdueNotifiedAt: Date | null }, now: Date): "due-soon" | "overdue" | null {
  if (step.dueAt <= now) return step.overdueNotifiedAt ? null : "overdue";
  if (step.dueAt.getTime() - now.getTime() <= REQUEST_DUE_SOON_HOURS * 3_600_000) return step.dueSoonNotifiedAt ? null : "due-soon";
  return null;
}

const note = (max: number, message: string) => z.string(message).trim().min(1, message).max(max, `Tối đa ${max} ký tự`);

// Phòng Đào tạo xử lý thay: đồng ý, không đồng ý hoặc bỏ qua bước, luôn ghi lý do.
export const SUPERVISE_STEP_SCHEMA = z.object({
  step: z.int().min(0),
  decision: z.enum(["approved", "rejected", "skipped"], "Chưa chọn cách xử lý"),
  reason: note(500, "Ghi lý do xử lý thay"),
  effect: z.record(z.string(), z.unknown()).optional(),
});

export type SuperviseStepInput = z.input<typeof SUPERVISE_STEP_SCHEMA>;

// Chuyển bước cố vấn, giảng viên cho giảng viên khác (cố vấn nghỉ, lớp không còn cố vấn, giảng viên đổi lớp).
export const REASSIGN_STEP_SCHEMA = z.object({
  step: z.int().min(0),
  lecturerId: z.uuid("Chưa chọn giảng viên"),
  reason: note(500, "Ghi lý do chuyển người xử lý"),
});

export type ReassignStepInput = z.input<typeof REASSIGN_STEP_SCHEMA>;

export const SUPPLEMENT_REQUEST_SCHEMA = z.object({
  step: z.int().min(0),
  note: note(500, "Ghi rõ cần bổ sung gì"),
});

export type SupplementRequestInput = z.input<typeof SUPPLEMENT_REQUEST_SCHEMA>;

// Người gửi bổ sung: ghi chú (có thể trống) và tệp; phải có ít nhất một trong hai (kiểm ở action vì tệp đi riêng).
export const SUPPLEMENT_SUBMIT_SCHEMA = z.object({
  requestId: z.uuid("Đơn không hợp lệ"),
  note: z.string().trim().max(500, "Tối đa 500 ký tự").default(""),
});

export type SupplementSubmitInput = z.input<typeof SUPPLEMENT_SUBMIT_SCHEMA>;

// Gửi lại đơn bị từ chối: kế thừa nội dung và minh chứng của đơn cũ, sửa lý do, thêm tệp.
export const RESUBMIT_SCHEMA = z.object({
  requestId: z.uuid("Đơn không hợp lệ"),
  reason: reason(1000),
  keepAttachmentIds: z.array(z.uuid()).max(ATTACHMENT_LIMIT.files).default([]),
});

export type ResubmitInput = z.input<typeof RESUBMIT_SCHEMA>;

// ---------- Đọc lại nội dung đơn cho kết quả đơn (handler khi duyệt xong) ----------
// Phần chi tiết của đơn do server ghép (studentRequestContent, teachingLeaveContent) nên đọc lại theo đúng nhãn và định dạng đó.

export function detailValue(details: RequestDetail[], label: string) {
  return details.find((detail) => detail.label === label)?.value ?? null;
}

// Số tín chỉ xin đăng ký của đơn học vượt.
export function overloadCreditsOf(details: RequestDetail[]) {
  const value = Number((detailValue(details, "Số tín chỉ xin đăng ký") ?? "").replace(",", "."));
  return Number.isInteger(value) && value > 0 ? value : null;
}

// Số học kỳ xin bảo lưu ("1 học kỳ", "2 học kỳ").
export function reserveTermsOf(details: RequestDetail[]) {
  const match = /(\d+)/.exec(detailValue(details, "Thời gian bảo lưu") ?? "");
  return match ? Number(match[1]) : null;
}

// Bảo lưu: tổng số học kỳ đã bảo lưu (và đang xin) cộng số học kỳ của đơn này không vượt quy chế.
export function reserveBlockedReason(input: { used: number; requested: number }, maxReserveTerms: number) {
  if (input.used + input.requested <= maxReserveTerms) return null;
  const left = Math.max(0, maxReserveTerms - input.used);
  return left === 0
    ? `Bạn đã bảo lưu (hoặc đang xin bảo lưu) đủ ${maxReserveTerms} học kỳ tối đa theo quy chế, không xin thêm được.`
    : `Quy chế cho bảo lưu tối đa ${maxReserveTerms} học kỳ; bạn đã dùng ${input.used} học kỳ nên chỉ xin thêm được ${left} học kỳ.`;
}

const COURSE_CODE_IN_TEXT = /\b([A-Z]{4}\d{4})\b/;

// Mã học phần trong đơn xin mở lớp ("COMP1031 Lập trình hướng đối tượng").
export function openClassCourseCode(details: RequestDetail[], subject: string) {
  const text = (detailValue(details, "Mã và tên học phần") ?? subject).toUpperCase();
  return COURSE_CODE_IN_TEXT.exec(text)?.[1] ?? null;
}

export function openClassPeersOf(details: RequestDetail[]) {
  const value = Number(detailValue(details, "Số sinh viên cùng đề nghị") ?? "");
  return Number.isInteger(value) && value > 0 ? value : null;
}

// Buổi nghỉ của đơn nghỉ dạy: "Thứ 3, 20/10/2026, Tiết 1-3, phòng B.405" (sessionLabel) cùng lịch dạy bù đề xuất.
export function teachingLeaveSlotOf(details: RequestDetail[]) {
  const text = detailValue(details, "Buổi nghỉ") ?? "";
  const date = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const periods = /tiết\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?/i.exec(text);
  if (!date || !periods) return null;
  const startPeriod = Number(periods[1]);
  return {
    date: `${date[3]}-${date[2]}-${date[1]}`,
    startPeriod,
    endPeriod: periods[2] ? Number(periods[2]) : startPeriod,
    makeup: detailValue(details, "Dạy bù") ?? "",
  };
}
