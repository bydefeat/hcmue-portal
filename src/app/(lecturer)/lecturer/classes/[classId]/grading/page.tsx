import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassRoster, getClassSection } from "@/modules/course-registration/course-registration.query";
import { GradingTable } from "@/modules/grades/components/grading-table";
import { getGradeSheet } from "@/modules/grades/grades.query";
import { getCurrentLecturer } from "@/modules/users/users.query";
import { lecturerRequestOptions } from "@/app/(lecturer)/lecturer/_data/request-options";

export const metadata: Metadata = { title: "Nhập điểm" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, roster, lecturer] = await Promise.all([getClassSection(classId), getClassRoster(classId), getCurrentLecturer()]);
  if (!section || section.lecturerId !== lecturer.id) notFound();
  const [sheet, requestOptions] = await Promise.all([getGradeSheet(section.id), lecturerRequestOptions(lecturer)]);
  if (!sheet) notFound();

  return (
    <GradingTable
      sheet={sheet}
      students={roster}
      classCode={section.code}
      classId={section.id}
      returnReason={sheet.returnReason}
      requestOptions={requestOptions}
    />
  );
}
