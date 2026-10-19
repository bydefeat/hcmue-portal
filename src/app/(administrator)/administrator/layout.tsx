import { requireRole } from "@/modules/authentication/authentication.query";
import { AdministratorLayout, type SearchEntry } from "@/shared/components/layouts/administrator";
import { switchDemoViewer } from "@/modules/access/access.action";
import { can, inScope } from "@/modules/access/access.constant";
import { getRoleAssignments, getRoles, getViewer } from "@/modules/access/access.query";
import type { Viewer } from "@/modules/access/access.type";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { NOTIFICATION_KIND_LABEL } from "@/modules/notifications/notifications.constant";
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
            href: `/administrator/users/students/${student.id}`,
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
  await requireRole("admin");
  const viewer = await getViewer();
  const [entries, currentTerm, notifications, roles, assignments] = await Promise.all([
    searchEntries(viewer),
    getCurrentTerm(),
    getNotifications("administrator"),
    getRoles(),
    getRoleAssignments(),
  ]);
  const currentAssignment = assignments.find((assignment) => assignment.userId === viewer.id);
  const switcher = {
    current: currentAssignment?.id ?? "",
    action: switchDemoViewer,
    options: assignments.map((assignment) => ({
      value: assignment.id,
      label: assignment.userName,
      description: `${roles.find((role) => role.id === assignment.roleId)?.name ?? ""}${assignment.faculty ? `, ${assignment.faculty}` : ""}`,
    })),
  };

  return (
    <AdministratorLayout
      user={{ name: viewer.name, code: viewer.code, role: viewer.roleName }}
      termLabel={currentTerm.name}
      permissions={viewer.permissions}
      searchEntries={entries}
      notifications={notifications.map((notification) => ({ ...notification, kindLabel: NOTIFICATION_KIND_LABEL[notification.kind] }))}
      switcher={switcher}
    >
      {children}
    </AdministratorLayout>
  );
}
