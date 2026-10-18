export type NotificationAudience = "administrator" | "lecturer" | "student";

export type NotificationKind = "request" | "deadline" | "grade" | "exam" | "announcement" | "advising" | "system";

export type AppNotification = {
  id: string;
  audience: NotificationAudience;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  isRead: boolean;
};
