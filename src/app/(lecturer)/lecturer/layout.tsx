import { requireRole } from "@/modules/authentication/authentication.query";
import { LecturerLayout } from "@/shared/components/layouts/lecturer";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { getCurrentLecturer } from "@/modules/users/users.query";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("lecturer");
  const [lecturer, notifications] = await Promise.all([getCurrentLecturer(), getNotifications("lecturer")]);
  const user = { name: session.user.name, code: lecturer.code, role: lecturer.faculty };
  return (
    <LecturerLayout
      user={user}
      isAdvisor={lecturer.isAdvisor}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
    >
      {children}
    </LecturerLayout>
  );
}
