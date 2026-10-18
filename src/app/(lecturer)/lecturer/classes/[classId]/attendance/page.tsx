import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassRoster, getClassSection } from "@/modules/course-registration/course-registration.query";
import { AttendanceSheet } from "@/modules/schedule/components/attendance-sheet";
import { getAttendanceBook } from "@/modules/schedule/schedule.query";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, roster] = await Promise.all([getClassSection(classId), getClassRoster(classId)]);
  if (!section) notFound();
  const book = await getAttendanceBook(
    section.id,
    roster.map((entry) => entry.studentId),
    section.meetings,
    section.startDate,
  );
  return <AttendanceSheet book={book} students={roster} />;
}
