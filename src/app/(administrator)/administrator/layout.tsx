import { AdministratorLayout, type SearchEntry } from "@/shared/components/layouts/administrator";
import { getClassSections, getCurrentTerm, getRegistrationTargetTerm } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getLecturers, getStudents } from "@/modules/users/users.query";

const DEMO_ADMINISTRATOR = { name: "Nguyễn Thị Thu Hà", code: "PDT0012", role: "Chuyên viên Phòng Đào tạo" };

async function searchEntries(): Promise<SearchEntry[]> {
  const [students, lecturers, courses, currentTerm, targetTerm] = await Promise.all([
    getStudents(),
    getLecturers(),
    getCourses(),
    getCurrentTerm(),
    getRegistrationTargetTerm(),
  ]);
  const sections = (await Promise.all([getClassSections(currentTerm.id), getClassSections(targetTerm.id)])).flat();
  return [
    ...students.map((student) => ({
      group: "Sinh viên",
      label: student.fullName,
      description: `${student.code} · ${student.className}`,
      keywords: student.code,
      href: `/administrator/users/students/${student.id}`,
    })),
    ...lecturers.map((lecturer) => ({
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
    ...sections.map((section) => ({
      group: "Lớp học phần",
      label: `${section.code} ${section.courseName}`,
      description: `${section.termId === currentTerm.id ? currentTerm.shortName : targetTerm.shortName} · ${section.lecturerName ?? "Chưa phân công"}`,
      keywords: section.code,
      href: `/administrator/class-sections?term=${section.termId}&q=${section.code}`,
    })),
  ];
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [entries, currentTerm] = await Promise.all([searchEntries(), getCurrentTerm()]);
  return (
    <AdministratorLayout user={DEMO_ADMINISTRATOR} termLabel={currentTerm.name} searchEntries={entries}>
      {children}
    </AdministratorLayout>
  );
}
