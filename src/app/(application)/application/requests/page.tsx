import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { StudentRequestCenter } from "@/modules/requests/components/new-request-drawer";
import { getRequestsOf } from "@/modules/requests/requests.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getAdvisorOf, getCurrentStudent } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Đơn từ" };

export default async function Page({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const [student, term, courses, regulation] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getRegulation()]);
  const [requests, advisor, [standing], enrollments, transcript] = await Promise.all([
    getRequestsOf(student.id),
    getAdvisorOf(student.id),
    getStudentStandings([student.id]),
    getStudentEnrollments(student.id, term.id),
    getTranscript(student.id),
  ]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });

  return (
    <StudentRequestCenter
      requests={requests}
      rules={{ maxPerTerm: regulation.credits.maxPerTerm, overloadMinCpa: regulation.credits.overloadMinCpa, regradeWindowDays: regulation.workflow.regradeWindowDays }}
      initialOpenId={open}
      sections={timetable.map(({ section }) => ({ value: section.id, label: `${section.code} ${section.courseName}` }))}
      requester={{
        id: student.id,
        name: student.fullName,
        code: student.code,
        unit: student.className,
        faculty: student.faculty,
        cpa4: standing.cpa4,
        advisorId: advisor?.id ?? null,
        advisorName: advisor?.displayName ?? null,
      }}
    />
  );
}
