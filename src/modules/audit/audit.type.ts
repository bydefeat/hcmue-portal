export type AuditAction = "create" | "update" | "delete" | "approve" | "reject" | "publish" | "lock" | "assign" | "export" | "sign-in" | "permission";

export type AuditEntityType =
  | "student"
  | "lecturer"
  | "grade-sheet"
  | "class-section"
  | "registration-period"
  | "request"
  | "decision"
  | "announcement"
  | "role"
  | "regulation"
  | "exam"
  | "calendar-event"
  | "report"
  | "program";

export type AuditChange = {
  field: string;
  before: string;
  after: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actorName: string;
  actorRole: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  summary: string;
  changes: AuditChange[];
  ip: string;
};
