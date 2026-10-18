import { notFound } from "next/navigation";
import { LecturerClassLayout } from "@/shared/components/layouts/lecturer";
import { sectionScheduleText } from "@/modules/course-registration/components/lecturer-class-list";
import { getClassSection, getTerms } from "@/modules/course-registration/course-registration.query";
import { getCurrentLecturer } from "@/modules/users/users.query";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, lecturer, terms] = await Promise.all([getClassSection(classId), getCurrentLecturer(), getTerms()]);
  if (!section || section.lecturerId !== lecturer.id) notFound();
  const term = terms.find((entry) => entry.id === section.termId);
  const classContext = {
    id: section.id,
    code: section.code,
    courseName: section.courseName,
    credits: section.credits,
    enrolled: section.enrolled,
    capacity: section.capacity,
    scheduleText: sectionScheduleText(section),
    termLabel: term?.shortName ?? "",
  };
  return <LecturerClassLayout classContext={classContext}>{children}</LecturerClassLayout>;
}
