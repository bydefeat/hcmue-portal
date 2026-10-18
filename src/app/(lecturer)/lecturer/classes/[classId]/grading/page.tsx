import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassRoster, getClassSection } from "@/modules/course-registration/course-registration.query";
import { GradingTable } from "@/modules/grades/components/grading-table";
import { getGradeSheet } from "@/modules/grades/grades.query";

export const metadata: Metadata = { title: "Nhập điểm" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, roster] = await Promise.all([getClassSection(classId), getClassRoster(classId)]);
  if (!section) notFound();
  const sheet = await getGradeSheet(
    section.id,
    roster.map((entry) => entry.studentId),
  );
  return <GradingTable sheet={sheet} students={roster} classCode={section.code} />;
}
