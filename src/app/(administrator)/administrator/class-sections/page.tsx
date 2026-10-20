import type { Metadata } from "next";
import { ClassSectionTable } from "@/modules/course-registration/components/class-section-table";
import { getClassSections, getRegistrationTargetTerm, getTerms } from "@/modules/course-registration/course-registration.query";
import { getCourses, getMajors } from "@/modules/curriculum/curriculum.query";
import { getCampuses, getRooms } from "@/modules/facilities/facilities.query";
import { getCohorts, getLecturers } from "@/modules/users/users.query";
import { inScope } from "@/modules/access/access.constant";
import { requirePermission } from "@/modules/access/access.query";

export const metadata: Metadata = { title: "Lớp học phần" };

export default async function Page({ searchParams }: { searchParams: Promise<{ term?: string; q?: string }> }) {
  const viewer = await requirePermission("class-sections.manage");
  const [{ term, q }, terms, targetTerm, courses, lecturers, rooms, majors, cohorts] = await Promise.all([
    searchParams,
    getTerms(),
    getRegistrationTargetTerm(),
    getCourses(),
    getLecturers(),
    getRooms(),
    getMajors(),
    getCohorts(),
  ]);
  const campuses = await getCampuses();
  const campusOf = new Map(campuses.map((campus) => [campus.id, campus.name]));
  // Phòng bảo trì không xếp lớp được (server cũng chặn).
  const activeRooms = rooms.filter((room) => room.status === "active");
  const termId = terms.some((entry) => entry.id === term) ? term! : targetTerm.id;
  const sections = (await getClassSections(termId)).filter((section) => inScope(viewer, section.faculty));
  const openTerms = terms.filter((entry) => entry.isCurrent || entry.isRegistrationTarget);

  return (
    <ClassSectionTable
      header={{
        title: "Lớp học phần",
        description: "Mở lớp, phân công giảng viên và xếp phòng. Lớp trùng phòng hoặc trùng giờ giảng viên được đánh dấu để xử lý trước khi mở đăng ký.",
      }}
      key={termId}
      sections={sections}
      terms={openTerms}
      termId={termId}
      initialQuery={q}
      courses={courses.filter((course) => course.isActive).map(({ code, name, credits, faculty }) => ({ code, name, credits, faculty }))}
      rooms={activeRooms.map((room) => room.code)}
      roomLabels={Object.fromEntries(activeRooms.map((room) => [room.code, `${room.code} · ${room.capacity} chỗ · ${campusOf.get(room.campusId) ?? ""}`]))}
      majors={majors.map(({ code, name }) => ({ code, name }))}
      cohorts={cohorts}
      lecturers={lecturers
        .filter((lecturer) => lecturer.status === "active")
        .map(({ id, displayName, faculty }) => ({ id, displayName, faculty }))}
    />
  );
}
