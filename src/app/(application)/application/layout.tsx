import { requireRole } from "@/modules/authentication/authentication.query";
import { ApplicationLayout } from "@/shared/components/layouts/application";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { markAllNotificationsRead, markNotificationsRead } from "@/modules/notifications/notifications.action";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { getNotifications, getUnreadNotificationCount } from "@/modules/notifications/notifications.query";
import { formatStudentCode } from "@/shared/libs/student-code.lib";
import { getCurrentStudent } from "@/modules/users/users.query";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole("student");
  const [student, term, notifications, unread] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getNotifications("student"), getUnreadNotificationCount("student")]);
  return (
    <ApplicationLayout
      user={{ name: user.name, code: formatStudentCode(user.username ?? student.code), role: `${student.className} · ${student.majorName}` }}
      termLabel={term.name}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
      unreadNotifications={unread}
      onMarkNotificationsRead={markNotificationsRead}
      onMarkAllNotificationsRead={markAllNotificationsRead.bind(null, "student")}
    >
      {children}
    </ApplicationLayout>
  );
}
