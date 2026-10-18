import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { StudentExamList, type StudentExamItem } from "@/modules/exams/components/student-exam-list";
import { getExamsForClassSections } from "@/modules/exams/exams.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { getAttendanceBook } from "@/modules/schedule/schedule.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getCurrentStudent } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lịch thi" };

export default async function Page() {
  const [student, term, courses, regulation] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getRegulation()]);
  const [enrollments, transcript] = await Promise.all([getStudentEnrollments(student.id, term.id), getTranscript(student.id)]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const exams = await getExamsForClassSections(timetable.map(({ section }) => section.id));
  const books = await Promise.all(
    timetable.map(({ section }) => getAttendanceBook(section.id, [student.id], section.meetings, section.startDate)),
  );
  const limit = regulation.attendance.absenceLimitPercent;
  const absenceBySection = new Map(
    books.map((book) => {
      const held = book.sessions.filter((session) => session.isTaken);
      const absences = held.filter((session) => {
        const status = book.records[session.id]?.[student.id];
        return status === "absent" || status === "excused";
      }).length;
      return [book.classSectionId, { absences, sessionsHeld: held.length }];
    }),
  );
  const items: StudentExamItem[] = exams.map((exam) => {
    const attendance = absenceBySection.get(exam.classSectionId) ?? { absences: 0, sessionsHeld: 0 };
    return {
      exam,
      ...attendance,
      isBanned: attendance.sessionsHeld > 0 && (attendance.absences / attendance.sessionsHeld) * 100 >= limit,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{term.name} · {exams.length} ca thi của {timetable.length} học phần</p>
      <StudentExamList items={items} absenceLimitPercent={limit} />
    </div>
  );
}
