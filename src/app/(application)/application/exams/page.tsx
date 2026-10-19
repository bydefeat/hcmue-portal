import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { StudentExamList, type StudentExamItem } from "@/modules/exams/components/student-exam-list";
import { getExamsForClassSections, getStudentExamAttendance } from "@/modules/exams/exams.query";
import { isOverAbsenceLimit } from "@/modules/schedule/schedule.rule";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const [student, term, regulation] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getRegulation()]);
  const [enrollments, attendance] = await Promise.all([getStudentEnrollments(student.id, term.id), getStudentExamAttendance(term.id)]);
  const exams = await getExamsForClassSections(enrollments.map(({ section }) => section.id));
  const limit = regulation.attendance.absenceLimitPercent;
  const attendanceOf = new Map(attendance.map((entry) => [entry.classSectionId, entry]));
  const items: StudentExamItem[] = exams.map((exam) => {
    const { absences = 0, sessionsHeld = 0, overrideReason = null } = attendanceOf.get(exam.classSectionId) ?? {};
    // Phòng Khảo thí đã cho dự thi (có minh chứng) thì không còn cấm thi.
    return { exam, absences, sessionsHeld, isBanned: overrideReason === null && isOverAbsenceLimit(absences, sessionsHeld, limit) };
  });

  return (
    <>
      <PageHeader title="Lịch thi" description={`${term.name} · ${exams.length} ca thi của ${enrollments.length} học phần`} />
      <StudentExamList items={items} absenceLimitPercent={limit} />
    </>
  );
}
