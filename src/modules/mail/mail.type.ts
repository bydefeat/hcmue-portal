export type MailStatus = "pending" | "sending" | "sent" | "failed";

export type MailKind = "account-activation" | "registration-reminder" | "class-announcement" | "announcement";

export type MailOutboxStats = {
  // Chờ gửi lần đầu hoặc chờ tới lượt gửi lại (kể cả đang gửi).
  pending: number;
  retrying: number;
  sentLast30Days: number;
  failed: number;
};

// Thư có lỗi để quản trị xem và gửi lại; không kèm nội dung thư.
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
