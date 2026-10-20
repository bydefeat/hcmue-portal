import { AdministratorLayout, type SearchEntry } from "@/shared/components/layouts/administrator";
import { LECTURER_PORTAL_LINK } from "@/shared/constants/navigation.constant";
import { switchActiveRole } from "@/modules/access/access.action";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, getViewerAssignments } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { requireSession } from "@/modules/authentication/authentication.query";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { markAllNotificationsRead, markNotificationsRead } from "@/modules/notifications/notifications.action";
import { getNotifications, getUnreadNotificationCount } from "@/modules/notifications/notifications.query";
import { getLecturers, getStudents } from "@/modules/users/users.query";

// Ô tìm kiếm chung: chỉ đọc nhóm dữ liệu người xem có quyền mở, và chỉ trong khoa của mình.
async function searchEntries(viewer: Viewer): Promise<SearchEntry[]> {
  const [students, lecturers, courses, sections] = await Promise.all([
    can(viewer, "students.view") ? getStudents() : [],
    can(viewer, "lecturers.manage") ? getLecturers() : [],
    can(viewer, "curriculum.manage") ? getCourses() : [],
    can(viewer, "class-sections.manage")
      ? Promise.all([getCurrentTerm(), getRegistrationTargetTerm()]).then(async ([currentTerm, targetTerm]) =>
          (await Promise.all([getClassSections(currentTerm.id), getClassSections(targetTerm.id)])).flat().map((section) => ({
            ...section,
            termLabel: section.termId === currentTerm.id ? currentTerm.shortName : targetTerm.shortName,
          })),
        )
      : [],
  ]);
  return [
    ...students
      .filter((student) => inScope(viewer, student.faculty))
      .map((student) => ({
        group: "Sinh viên",
        label: student.fullName,
        description: `${student.code} · ${student.className}`,
        keywords: student.code,
        href: `/administrator/users/students/${student.code}`,
      })),
    ...lecturers
      .filter((lecturer) => inScope(viewer, lecturer.faculty))
      .map((lecturer) => ({
        group: "Giảng viên",
        label: lecturer.displayName,
        description: `${lecturer.code} · ${lecturer.faculty}`,
        keywords: `${lecturer.code} ${lecturer.email}`,
        href: `/administrator/users/lecturers?q=${lecturer.code}`,
      })),
    ...courses.map((course) => ({
      group: "Học phần",
      label: course.name,
      description: `${course.code} · ${course.credits} tín chỉ`,
      keywords: course.code,
      href: `/administrator/courses?q=${course.code}`,
    })),
    ...sections
      .filter((section) => inScope(viewer, section.faculty))
      .map((section) => ({
        group: "Lớp học phần",
        label: `${section.code} ${section.courseName}`,
        description: `${section.termLabel} · ${section.lecturerName ?? "Chưa phân công"}`,
        keywords: section.code,
        href: `/administrator/class-sections?term=${section.termId}&q=${section.code}`,
      })),
  ];
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  // getViewer() gọi requireRole("admin"): chưa đăng nhập về trang đăng nhập, không phải cán bộ quản trị thì 403.
  const viewer = await getViewer();
  const [entries, currentTerm, notifications, unread, assignments, session] = await Promise.all([
    searchEntries(viewer),
    getCurrentTerm(),
    getNotifications("administrator"),
    getUnreadNotificationCount("administrator"),
    getViewerAssignments(viewer.id),
    requireSession(),
  ]);
  const switcher =
    assignments.length > 1
      ? {
          current: viewer.assignmentId ?? "",
          action: switchActiveRole,
          options: assignments.map((assignment) => ({
            value: assignment.id,
            label: assignment.roleName,
            description: assignment.scope === "faculty" && assignment.faculty ? assignment.faculty : "Toàn trường",
          })),
        }
      : undefined;

  return (
    <AdministratorLayout
      user={{ name: viewer.name, code: viewer.code, role: viewer.roleName }}
      termLabel={currentTerm.name}
      permissions={viewer.permissions}
      schoolWide={viewer.faculty === null}
      portalLinks={session.roles.includes("lecturer") ? [LECTURER_PORTAL_LINK] : []}
      searchEntries={entries}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
      unreadNotifications={unread}
      onMarkNotificationsRead={markNotificationsRead}
      onMarkAllNotificationsRead={markAllNotificationsRead.bind(null, "administrator")}
      switcher={switcher}
    >
      {children}
    </AdministratorLayout>
  );
}
