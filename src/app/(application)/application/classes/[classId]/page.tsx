import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ClassLecturerCard } from "@/modules/teaching/components/class-lecturer-card";
import { StudentClassAnnouncements } from "@/modules/teaching/components/student-class-announcements";
import { SyllabusView } from "@/modules/teaching/components/syllabus-view";
import { publishDueClassAnnouncements } from "@/modules/teaching/teaching.lib";
import { getMyClass } from "@/modules/teaching/teaching.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lớp học phần" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const section = await getMyClass(classId);
  if (!section) notFound();
  after(() => publishDueClassAnnouncements({ classSectionId: section.id }).catch((error: unknown) => console.error("[teaching] Không báo được bài hẹn giờ:", error)));
  return (
    <>
      <PageHeader
        title={section.courseName}
        description={`${section.code} · ${section.credits} tín chỉ · ${section.termName}`}
        back={{ href: "/application/classes", label: "Lớp học phần" }}
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-2">
          <StudentClassAnnouncements announcements={section.announcements} />
          <SyllabusView syllabus={section.syllabus} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <ClassLecturerCard lecturer={section.lecturer} />
        </div>
      </div>
    </>
  );
}
