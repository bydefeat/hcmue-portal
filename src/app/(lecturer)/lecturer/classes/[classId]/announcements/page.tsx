import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClassSection } from "@/modules/course-registration/course-registration.query";
import { ClassAnnouncementBoard } from "@/modules/teaching/components/class-announcement-board";
import { after } from "next/server";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { getClassAnnouncements, requireTaughtClass } from "@/modules/teaching/teaching.query";

export const metadata: Metadata = { title: "Thông báo lớp" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await requireTaughtClass(classId);
  // Gọi bù tác vụ báo bài hẹn giờ cho riêng lớp này (sau khi trả trang), để không phụ thuộc hoàn toàn vào bộ hẹn giờ ngoài.
  after(() => publishDueClassAnnouncements({ classSectionId: classId }).catch((error: unknown) => console.error("[teaching] Không báo được bài hẹn giờ:", error)));
  const [section, announcements] = await Promise.all([getClassSection(classId), getClassAnnouncements(classId)]);
  if (!section || !announcements) notFound();
  return (
    <ClassAnnouncementBoard
      announcements={announcements}
      classSectionId={section.id}
      classCode={section.code}
      studentCount={section.enrolled}
    />
  );
}
