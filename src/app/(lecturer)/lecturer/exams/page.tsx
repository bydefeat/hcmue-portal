import type { Metadata } from "next";
import { getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import { LecturerExamBoard } from "@/modules/exams/components/lecturer-exam-board";
import { getExamsForLecturer } from "@/modules/exams/exams.query";
import { getCurrentLecturer, getLecturers } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const [lecturer, term] = await Promise.all([getCurrentLecturer(), getCurrentTerm()]);
  const [exams, sections, lecturers] = await Promise.all([getExamsForLecturer(lecturer.id), getLecturerClassSections(lecturer.id, term.id), getLecturers()]);
  const teaching = exams.filter((exam) => exam.lecturerId === lecturer.id);
  const proctoring = exams.filter((exam) => exam.proctors.some((proctor) => proctor.id === lecturer.id));
  const teachingSlots = sections.flatMap((section) => section.meetings.map((meeting) => ({ ...meeting, code: section.code })));
  const colleagues = lecturers
    .filter((entry) => entry.id !== lecturer.id && entry.faculty === lecturer.faculty && entry.status === "active")
    .map((entry) => ({ id: entry.id, name: entry.displayName }));

  return (
    <>
      <PageHeader
        title="Lịch thi"
        description={`${term.name} · ${teaching.length} ca thi của lớp bạn dạy, ${proctoring.length} ca coi thi. Nộp đề cho Phòng Khảo thí trước hạn để đề được duyệt.`}
      />
      <LecturerExamBoard lecturerId={lecturer.id} teaching={teaching} proctoring={proctoring} teachingSlots={teachingSlots} colleagues={colleagues} />
    </>
  );
}
