import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { StudentExamList, type StudentExamItem } from "@/modules/exams/components/student-exam-list";
import { getStudentExamAttendance, getStudentExams } from "@/modules/exams/exams.query";
import { isBannedFromExam } from "@/modules/exams/exams.rule";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const [student, term, regulation] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getRegulation()]);
  const [enrollments, attendance, { exams, deferrals }] = await Promise.all([getStudentEnrollments(student.id, term.id), getStudentExamAttendance(term.id), getStudentExams(term.id)]);
  const limit = regulation.attendance.absenceLimitPercent;
  const attendanceOf = new Map(attendance.map((entry) => [entry.classSectionId, entry]));
  const items: StudentExamItem[] = exams.map((exam) => {
    const entry = attendanceOf.get(exam.classSectionId);
    const absentPeriods = entry?.absentPeriods ?? 0;
    const plannedPeriods = entry?.plannedPeriods ?? 0;
    // Phòng Khảo thí đã cho dự thi (có minh chứng) thì không còn cấm thi.
    return { exam, absentPeriods, plannedPeriods, isBanned: !entry?.overrideReason && isBannedFromExam(absentPeriods, plannedPeriods, limit) };
  });
  const sectionName = new Map(enrollments.map(({ section }) => [section.id, `${section.courseName} (${section.code})`]));

  return (
    <>
      <PageHeader title="Lịch thi" description={`${term.name} · ${exams.length} ca thi đã công bố của ${enrollments.length} học phần`} />
      <StudentExamList items={items} absenceLimitPercent={limit} deferrals={deferrals.map((entry) => ({ ...entry, label: sectionName.get(entry.classSectionId) ?? "" }))} />
    </>
  );
}
