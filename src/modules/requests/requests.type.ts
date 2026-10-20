export type RequestKind =
  | "overload"
  | "withdraw"
  | "open-class"
  | "regrade"
  | "exam-postpone"
  | "reserve"
  | "transcript"
  | "credit-transfer"
  | "grade-change"
  | "teaching-leave";

export type StepRole = "advisor" | "lecturer" | "faculty" | "academic-office" | "exam-office";

export type StepStatus = "waiting" | "pending" | "approved" | "rejected" | "skipped";

export type ApprovalStep = {
  role: StepRole;
  label: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: StepStatus;
  actorName: string | null;
  actedAt: string | null;
  comment: string | null;
  dueAt: string | null;
  // Phòng Đào tạo xử lý thay hoặc bỏ qua bước (lý do ở comment).
  onBehalf: boolean;
  // Phòng Đào tạo chuyển người xử lý: ai chuyển, lý do.
  reassigned: { byName: string; reason: string; at: string } | null;
};

export type RequestStatus = "pending" | "in-review" | "needs-info" | "approved" | "rejected" | "cancelled";

// Yêu cầu bổ sung minh chứng của người xử lý và phần bổ sung của người gửi (nếu đã bổ sung).
export type RequestSupplement = {
  id: string;
  stepLabel: string;
  requestedByName: string;
  requestNote: string;
  requestedAt: string;
  respondedAt: string | null;
  responseNote: string | null;
};

// Người đang xem làm được gì với đơn; server tính bằng cùng hàm quyền với action, giao diện chỉ dùng để ẩn hiện nút.
export type RequestViewerCan = {
  decide: boolean;
  requestSupplement: boolean;
  supervise: boolean;
  reassign: boolean;
  cancel: boolean;
  supplement: boolean;
  resubmit: boolean;
  openFiles: boolean;
};

export type RequesterType = "student" | "lecturer";

export type RequestDetail = {
  label: string;
  value: string;
};

export type RequestAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type AcademicRequest = {
  id: string;
  code: string;
  kind: RequestKind;
  requesterType: RequesterType;
  requesterId: string;
  requesterName: string;
  requesterCode: string;
  requesterUnit: string;
  faculty: string;
  subject: string;
  details: RequestDetail[];
  reason: string;
  attachments: RequestAttachment[];
  createdAt: string;
  cancelledAt: string | null;
  steps: ApprovalStep[];
  supplements: RequestSupplement[];
  classSectionId: string | null;
  resubmittedFrom: { id: string; code: string } | null;
  resubmittedAs: { id: string; code: string } | null;
};

export type RequestView = AcademicRequest & {
  status: RequestStatus;
  currentStep: ApprovalStep | null;
  isOverdue: boolean;
  openSupplement: RequestSupplement | null;
  can: RequestViewerCan;
};

export type RequestKindConfig = {
  label: string;
  requesterType: RequesterType;
  steps: { role: StepRole; label: string; slaDays: number }[];
  // Loại đơn bắt buộc kèm minh chứng (server chặn đơn không có tệp nào).
  attachmentsRequired: boolean;
};

// Tham số quy chế dùng để mô tả và kiểm điều kiện gửi đơn (đọc từ getRegulation()).
export type RequestRules = {
  maxPerTerm: number;
  overloadMinCpa: number;
  regradeWindowDays: number;
};
