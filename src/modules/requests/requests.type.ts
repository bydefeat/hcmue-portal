export type RequestKind =
  | "overload"
  | "withdraw"
  | "open-class"
  | "regrade"
  | "exam-postpone"
  | "reserve"
  | "transcript"
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
};

export type RequestStatus = "pending" | "in-review" | "approved" | "rejected" | "cancelled";

export type RequesterType = "student" | "lecturer";

export type RequestDetail = {
  label: string;
  value: string;
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
  attachments: string[];
  createdAt: string;
  cancelledAt: string | null;
  steps: ApprovalStep[];
};

export type RequestView = AcademicRequest & {
  status: RequestStatus;
  currentStep: ApprovalStep | null;
  isOverdue: boolean;
};

export type RequestKindConfig = {
  label: string;
  requesterType: RequesterType;
  description: string;
  steps: { role: StepRole; label: string; slaDays: number }[];
};
