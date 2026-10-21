export type MailStatus = "pending" | "sending" | "sent" | "failed";

export type MailKind = "account-activation" | "registration-reminder" | "class-announcement" | "announcement";

export type MailOutboxStats = {
  pending: number;
  retrying: number;
  sentLast30Days: number;
  failed: number;
};

export type MailProblem = {
  id: string;
  kind: MailKind;
  recipient: string;
  subject: string;
  status: MailStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
};

export type MailOutboxOverview = {
  stats: MailOutboxStats;
  problems: MailProblem[];
};
