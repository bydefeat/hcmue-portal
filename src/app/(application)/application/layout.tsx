import { ApplicationLayout } from "@/shared/components/layouts/application";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { getCurrentStudent } from "@/modules/users/users.query";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [student, term, notifications] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getNotifications("student")]);
  return (
    <ApplicationLayout
      user={{ name: student.fullName, code: student.code, role: `${student.className} · ${student.majorName}` }}
      termLabel={term.name}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
    >
      {children}
    </ApplicationLayout>
  );
}
