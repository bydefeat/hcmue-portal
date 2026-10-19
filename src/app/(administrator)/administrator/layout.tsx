import { AdministratorLayout, type SearchEntry } from "@/shared/components/layouts/administrator";
import { switchActiveRole } from "@/modules/access/access.action";
import { can, inScope } from "@/modules/access/access.constant";
import { getViewer, getViewerAssignments } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
import { markNotificationsRead } from "@/modules/notifications/notifications.action";
import { getNotifications } from "@/modules/notifications/notifications.query";
import { getLecturers, getStudents } from "@/modules/users/users.query";

async function searchEntries(viewer: Viewer): Promise<SearchEntry[]> {
  const [students, lecturers, courses, currentTerm, targetTerm] = await Promise.all([
    getStudents(),
    getLecturers(),
    getCourses(),
    getCurrentTerm(),
    getRegistrationTargetTerm(),
  ]);
  const sections = (await Promise.all([getClassSections(currentTerm.id), getClassSections(targetTerm.id)])).flat();
  return [
    ...(can(viewer, "students.view")
      ? students
          .filter((student) => inScope(viewer, student.faculty))
          .map((student) => ({
            group: "Sinh viên",
            label: student.fullName,
            description: `${student.code} · ${student.className}`,
            keywords: student.code,
            href: `/administrator/users/students/${student.code}`,
          }))
      : []),
    ...(can(viewer, "lecturers.manage")
      ? lecturers.map((lecturer) => ({
          group: "Giảng viên",
          label: lecturer.displayName,
          description: `${lecturer.code} · ${lecturer.faculty}`,
          keywords: `${lecturer.code} ${lecturer.email}`,
          href: `/administrator/users/lecturers?q=${lecturer.code}`,
        }))
      : []),
    ...(can(viewer, "curriculum.manage")
      ? courses.map((course) => ({
          group: "Học phần",
          label: course.name,
          description: `${course.code} · ${course.credits} tín chỉ`,
          keywords: course.code,
          href: `/administrator/courses?q=${course.code}`,
        }))
      : []),
    ...(can(viewer, "class-sections.manage")
      ? sections
          .filter((section) => inScope(viewer, section.faculty))
          .map((section) => ({
            group: "Lớp học phần",
            label: `${section.code} ${section.courseName}`,
            description: `${section.termId === currentTerm.id ? currentTerm.shortName : targetTerm.shortName} · ${section.lecturerName ?? "Chưa phân công"}`,
            keywords: section.code,
            href: `/administrator/class-sections?term=${section.termId}&q=${section.code}`,
          }))
      : []),
  ];
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  // getViewer() gọi requireRole("admin"): chưa đăng nhập về trang đăng nhập, không phải cán bộ quản trị thì 403.
  const viewer = await getViewer();
  const [entries, currentTerm, notifications, assignments] = await Promise.all([
    searchEntries(viewer),
    getCurrentTerm(),
    getNotifications("administrator"),
    getViewerAssignments(viewer.id),
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
      searchEntries={entries}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
      onMarkNotificationsRead={markNotificationsRead}
      switcher={switcher}
    >
      {children}
    </AdministratorLayout>
  );
}
