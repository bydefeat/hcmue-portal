import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassSection } from "@/modules/course-registration/course-registration.query";
import { ClassAnnouncementBoard } from "@/modules/teaching/components/class-announcement-board";
import { getClassAnnouncements } from "@/modules/teaching/teaching.query";

export const metadata: Metadata = { title: "Thông báo lớp" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, announcements] = await Promise.all([getClassSection(classId), getClassAnnouncements(classId)]);
  if (!section) notFound();
  return (
    <ClassAnnouncementBoard
      announcements={announcements}
      classSectionId={section.id}
      classCode={section.code}
      studentCount={section.enrolled}
    />
  );
}
