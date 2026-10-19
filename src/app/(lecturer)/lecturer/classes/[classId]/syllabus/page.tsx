import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassSection } from "@/modules/course-registration/course-registration.query";
import { getGradeSheet } from "@/modules/grades/grades.query";
import { SyllabusEditor } from "@/modules/teaching/components/syllabus-editor";
import { getSyllabus, requireTaughtClass } from "@/modules/teaching/teaching.query";

export const metadata: Metadata = { title: "Đề cương" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireTaughtClass(classId);
  const section = await getClassSection(classId);
  if (!section) notFound();
  const [syllabus, sheet] = await Promise.all([
    getSyllabus(section.id, { courseCode: section.courseCode, courseName: section.courseName }),
    getGradeSheet(section.id),
  ]);
  if (!sheet || !syllabus) notFound();
  return <SyllabusEditor syllabus={syllabus} gradeComponents={sheet.components} classCode={section.code} />;
}
