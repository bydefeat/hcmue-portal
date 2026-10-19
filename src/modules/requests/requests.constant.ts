import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs } from "@/shared/libs/date.lib";
import { MB, type UploadKind } from "@/shared/libs/upload.lib";
import type { AcademicRequest, RequesterType, RequestKind, RequestKindConfig, RequestStatus, RequestView, StepRole, StepStatus } from "@/modules/requests/requests.type";

export const STEP_ROLE_LABEL: Record<StepRole, string> = {
  advisor: "Cố vấn học tập",
  lecturer: "Giảng viên",
  faculty: "Khoa",
  "academic-office": "Phòng Đào tạo",
  "exam-office": "Phòng Khảo thí",
};

export const REQUEST_KINDS: Record<RequestKind, RequestKindConfig> = {
  overload: {
    label: "Học vượt tín chỉ",
    requesterType: "student",
    description: "Đăng ký quá hạn mức 25 tín chỉ trong học kỳ. Chỉ xét cho sinh viên có CPA từ 2,5.",
    steps: [
      { role: "advisor", label: "Cố vấn học tập xác nhận", slaDays: 3 },
      { role: "faculty", label: "Khoa đồng ý", slaDays: 3 },
      { role: "academic-office", label: "Phòng Đào tạo phê duyệt", slaDays: 3 },
    ],
  },
  withdraw: {
    label: "Rút học phần",
    requesterType: "student",
    description: "Rút học phần sau đợt điều chỉnh, học phần nhận điểm W và vẫn tính học phí.",
    steps: [
      { role: "advisor", label: "Cố vấn học tập xác nhận", slaDays: 3 },
      { role: "academic-office", label: "Phòng Đào tạo cập nhật", slaDays: 3 },
    ],
  },
  "open-class": {
    label: "Xin mở lớp học phần",
    requesterType: "student",
    description: "Đề nghị mở thêm lớp khi lớp hiện có đã đủ chỗ hoặc học phần chưa mở trong kỳ.",
    steps: [
      { role: "faculty", label: "Khoa xác nhận giảng viên", slaDays: 5 },
      { role: "academic-office", label: "Phòng Đào tạo xếp lớp", slaDays: 5 },
    ],
  },
  regrade: {
    label: "Phúc khảo bài thi",
    requesterType: "student",
    description: "Chấm lại bài thi cuối kỳ. Nộp trong 7 ngày kể từ ngày công bố điểm.",
    steps: [
      { role: "exam-office", label: "Phòng Khảo thí tiếp nhận", slaDays: 2 },
      { role: "lecturer", label: "Giảng viên chấm lại", slaDays: 5 },
      { role: "exam-office", label: "Phòng Khảo thí công bố", slaDays: 2 },
    ],
  },
  "exam-postpone": {
    label: "Hoãn thi",
    requesterType: "student",
    description: "Vắng thi có lý do chính đáng, kèm minh chứng. Được thi ở đợt thi kế tiếp.",
    steps: [
      { role: "lecturer", label: "Giảng viên xác nhận", slaDays: 2 },
      { role: "exam-office", label: "Phòng Khảo thí duyệt", slaDays: 3 },
    ],
  },
  reserve: {
    label: "Bảo lưu kết quả học tập",
    requesterType: "student",
    description: "Tạm dừng học tối đa 2 học kỳ, giữ nguyên kết quả đã tích lũy.",
    steps: [
      { role: "advisor", label: "Cố vấn học tập xác nhận", slaDays: 3 },
      { role: "faculty", label: "Khoa đồng ý", slaDays: 5 },
      { role: "academic-office", label: "Phòng Đào tạo ra quyết định", slaDays: 7 },
    ],
  },
  transcript: {
    label: "Cấp bảng điểm",
    requesterType: "student",
    description: "Bảng điểm có đóng dấu, nhận tại Phòng Đào tạo hoặc gửi bản điện tử.",
    steps: [{ role: "academic-office", label: "Phòng Đào tạo cấp", slaDays: 3 }],
  },
  "credit-transfer": {
    label: "Công nhận, chuyển điểm",
    requesterType: "student",
    description: "Công nhận học phần đã học ở trường khác hoặc ngành khác. Khoa đối chiếu đề cương, học phần tương đương từ 80% nội dung và cùng số tín chỉ trở lên.",
    steps: [
      { role: "faculty", label: "Khoa đối chiếu đề cương", slaDays: 7 },
      { role: "academic-office", label: "Phòng Đào tạo công nhận và cập nhật điểm", slaDays: 5 },
    ],
  },
  "grade-change": {
    label: "Sửa điểm sau khi chốt",
    requesterType: "lecturer",
    description: "Điều chỉnh điểm đã chốt do nhập sai hoặc sau phúc khảo, cần minh chứng.",
    steps: [
      { role: "faculty", label: "Trưởng khoa xác nhận", slaDays: 3 },
      { role: "academic-office", label: "Phòng Đào tạo cập nhật", slaDays: 3 },
    ],
  },
  "teaching-leave": {
    label: "Nghỉ dạy, dạy bù",
    requesterType: "lecturer",
    description: "Báo nghỉ một buổi dạy và đăng ký lịch dạy bù.",
    steps: [
      { role: "faculty", label: "Khoa đồng ý", slaDays: 2 },
      { role: "academic-office", label: "Phòng Đào tạo xếp phòng dạy bù", slaDays: 2 },
    ],
  },
};

export const REQUEST_KIND_OPTIONS = (Object.keys(REQUEST_KINDS) as RequestKind[]).map((value) => ({
  value,
  label: REQUEST_KINDS[value].label,
}));

export const STUDENT_REQUEST_KINDS = (Object.keys(REQUEST_KINDS) as RequestKind[]).filter((kind) => REQUEST_KINDS[kind].requesterType === "student");

export const LECTURER_REQUEST_KINDS = (Object.keys(REQUEST_KINDS) as RequestKind[]).filter((kind) => REQUEST_KINDS[kind].requesterType === "lecturer");

export const REQUEST_STATUS: Record<RequestStatus, StatusMeta> = {
  pending: { label: "Chờ tiếp nhận", tone: "neutral" },
  "in-review": { label: "Đang xử lý", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
  cancelled: { label: "Đã hủy", tone: "neutral" },
};

export const REQUEST_STATUS_OPTIONS = (Object.keys(REQUEST_STATUS) as RequestStatus[]).map((value) => ({
  value,
  label: REQUEST_STATUS[value].label,
}));

export const STEP_STATUS: Record<StepStatus, StatusMeta> = {
  waiting: { label: "Chưa đến lượt", tone: "neutral" },
  pending: { label: "Đang chờ", tone: "warning" },
  approved: { label: "Đồng ý", tone: "success" },
  rejected: { label: "Không đồng ý", tone: "danger" },
  skipped: { label: "Bỏ qua", tone: "neutral" },
};

export function requestView(request: AcademicRequest): RequestView {
  const currentStep = request.steps.find((step) => step.status === "pending") ?? null;
  let status: RequestStatus;
  if (request.cancelledAt) status = "cancelled";
  else if (request.steps.some((step) => step.status === "rejected")) status = "rejected";
  else if (request.steps.every((step) => step.status === "approved" || step.status === "skipped")) status = "approved";
  else if (request.steps.some((step) => step.status === "approved")) status = "in-review";
  else status = "pending";
  const isOverdue = Boolean(currentStep?.dueAt && dayjs().isAfter(currentStep.dueAt) && (status === "pending" || status === "in-review"));
  return { ...request, status, currentStep, isOverdue };
}

// Bước của đơn vị quản trị: vai trò hệ thống nào xử lý bước nào. Chỉ vai trò toàn quyền (Trưởng phòng Đào tạo, Quản trị hệ thống)
// xử lý được mọi bước; vai trò tự tạo hoặc khóa lạ không xử lý bước nào dù có quyền requests.process, để không vượt quyền
// của khoa, phòng. Bước cố vấn, giảng viên chỉ xử lý ở cổng giảng viên.
const OFFICE_STEP_ROLES: Partial<Record<string, StepRole[]>> = {
  "system-admin": ["academic-office", "faculty", "exam-office"],
  "academic-head": ["academic-office", "faculty", "exam-office"],
  "academic-officer": ["academic-office"],
  "faculty-secretary": ["faculty"],
  "exam-office": ["exam-office"],
};

export function officeStepRoles(roleKey: string | null): StepRole[] {
  return (roleKey ? OFFICE_STEP_ROLES[roleKey] : undefined) ?? [];
}

export const OFFICE_UNIT_LABEL: Record<Exclude<StepRole, "advisor" | "lecturer" | "faculty">, string> = {
  "academic-office": "Phòng Đào tạo",
  "exam-office": "Phòng Khảo thí",
};

export const REQUEST_CODE_PREFIX: Record<RequesterType, "DT" | "GV"> = { student: "DT", lecturer: "GV" };

// Mỗi tệp tối đa 10 MB (DB chặn bằng request_attachments_size_range), cả đơn tối đa 25 MB để vừa giới hạn thân request của server action.
export const ATTACHMENT_LIMIT = { files: 5, bytes: 10 * MB, totalBytes: 25 * MB, kinds: ["pdf", "png", "jpeg", "docx"] as UploadKind[] };

export function requestAttachmentHref(attachmentId: string) {
  return `/api/files/requests/${attachmentId}`;
}

export const ATTACHMENT_HINT = "PDF, ảnh PNG/JPG hoặc Word (.docx), tối đa 5 tệp, mỗi tệp không quá 10 MB, tổng không quá 25 MB";

export type RequestFieldSpec = {
  name: string;
  label: string;
  kind: "number" | "text" | "section" | "date" | "select";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  // Sinh viên tự khai, hệ thống có giá trị riêng để đối chiếu: chi tiết đơn ghi rõ "sinh viên khai".
  declared?: boolean;
};

// Thông tin riêng của từng loại đơn sinh viên: form hiện theo danh sách này, server kiểm lại và ghép thành phần chi tiết của đơn.
export const STUDENT_REQUEST_FIELDS: Record<RequestKind, RequestFieldSpec[]> = {
  overload: [
    { name: "credits", label: "Số tín chỉ xin đăng ký", kind: "number", min: 26, max: 30, step: 1 },
    { name: "extra", label: "Học phần muốn học thêm", kind: "text" },
  ],
  withdraw: [{ name: "section", label: "Lớp học phần", kind: "section" }],
  "open-class": [
    { name: "course", label: "Mã và tên học phần", kind: "text" },
    { name: "peers", label: "Số sinh viên cùng đề nghị", kind: "number", min: 1, max: 200, step: 1 },
  ],
  regrade: [
    { name: "section", label: "Lớp học phần", kind: "section" },
    { name: "score", label: "Điểm thi hiện tại", kind: "number", min: 0, max: 10, step: 0.25, declared: true },
  ],
  "exam-postpone": [
    { name: "section", label: "Lớp học phần", kind: "section" },
    { name: "examDate", label: "Ngày thi", kind: "date", declared: true },
  ],
  reserve: [{ name: "duration", label: "Thời gian bảo lưu", kind: "select", options: ["1 học kỳ", "2 học kỳ"] }],
  transcript: [
    { name: "copies", label: "Số bản", kind: "number", min: 1, max: 10, step: 1 },
    { name: "language", label: "Ngôn ngữ", kind: "select", options: ["Tiếng Việt", "Tiếng Anh", "Cả hai"] },
    { name: "delivery", label: "Hình thức nhận", kind: "select", options: ["Nhận tại Phòng Đào tạo", "Bản điện tử qua email"] },
  ],
  "credit-transfer": [
    { name: "source", label: "Học phần đã học (mã, tên, số tín chỉ, điểm)", kind: "text" },
    { name: "school", label: "Nơi học", kind: "text" },
    { name: "target", label: "Học phần xin công nhận", kind: "text" },
  ],
  "grade-change": [],
  "teaching-leave": [],
};

export const REQUESTS_CONSTRAINT_MESSAGE: Partial<Record<string, string>> = {
  academic_requests_code_unique: "Mã đơn vừa cấp bị trùng. Gửi lại đơn.",
  academic_requests_code_format: "Mã đơn phải có dạng DT-2026-01255 hoặc GV-2026-00310.",
  academic_requests_single_requester: "Đơn phải có đúng một người gửi.",
  academic_requests_details_array: "Thông tin chi tiết của đơn không đúng định dạng.",
  request_steps_request_id_position_unique: "Đơn đã có bước duyệt ở vị trí này.",
  request_steps_position_positive: "Thứ tự bước duyệt bắt đầu từ 1.",
  request_steps_one_pending: "Mỗi đơn chỉ có một bước đang chờ xử lý. Tải lại trang để xem tiến độ mới.",
  request_steps_acted_fields: "Bước đã đồng ý hoặc không đồng ý phải có thời điểm xử lý.",
  request_steps_actor_name: "Bước đã xử lý phải ghi tên người xử lý.",
  request_steps_reject_comment: "Không đồng ý thì phải ghi lý do để người gửi biết cần bổ sung gì.",
  request_steps_pending_due: "Bước đang chờ xử lý phải có hạn xử lý.",
  request_steps_lecturer_assignee: "Bước của giảng viên phải gán giảng viên dạy lớp, bước khác không gán giảng viên.",
  request_steps_assignee_lecturer_id_lecturers_id_fk: "Giảng viên còn bước đơn từ được giao, không xóa được.",
  request_attachments_size_range: "Mỗi tệp minh chứng từ 1 byte đến 10 MB.",
  request_attachments_storage_key_unique: "Tệp minh chứng bị trùng khóa lưu trữ. Gửi lại đơn.",
  request_code_counters_last_value_range: "Đã hết số mã đơn của năm nay (tối đa 99999). Báo quản trị hệ thống.",
};
