import type { Metadata } from "next";
import { ClassRosterTable } from "@/modules/course-registration/components/class-roster-table";
import { getClassRoster, getClassSection } from "@/modules/course-registration/course-registration.query";

export const metadata: Metadata = { title: "Danh sách lớp" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, roster] = await Promise.all([getClassSection(classId), getClassRoster(classId)]);
  return <ClassRosterTable roster={roster} classCode={section?.code ?? ""} />;
}
