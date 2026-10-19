import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassRoster } from "@/modules/course-registration/course-registration.query";
import { AttendanceSheet } from "@/modules/schedule/components/attendance-sheet";
import { getAttendanceBook } from "@/modules/schedule/schedule.query";
import { getRegulation } from "@/modules/settings/settings.query";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [book, roster, regulation] = await Promise.all([getAttendanceBook(classId), getClassRoster(classId), getRegulation()]);
  if (!book) notFound();
  return <AttendanceSheet book={book} students={roster} absenceLimitPercent={regulation.attendance.absenceLimitPercent} />;
}
