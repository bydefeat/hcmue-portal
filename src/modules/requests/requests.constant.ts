import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs } from "@/shared/libs/date.lib";
import type { AcademicRequest, RequestKind, RequestKindConfig, RequestStatus, RequestView, StepRole, StepStatus } from "./requests.type";

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

export function decideStep(request: AcademicRequest, decision: "approved" | "rejected", actorName: string, comment: string): AcademicRequest {
  const index = request.steps.findIndex((step) => step.status === "pending");
  if (index < 0) return request;
  const now = dayjs();
  const steps = request.steps.map((step, position) => {
    if (position === index) return { ...step, status: decision, actorName, actedAt: now.toISOString(), comment: comment || null };
    if (position === index + 1 && decision === "approved") {
      const slaDays = REQUEST_KINDS[request.kind].steps[position]?.slaDays ?? 3;
      return { ...step, status: "pending" as const, dueAt: now.add(slaDays, "day").toISOString() };
    }
    return step;
  });
  return { ...request, steps };
}
