import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { StudentCurriculumProgress, type CourseProgress } from "@/modules/curriculum/components/student-curriculum-progress";
import { getCourses, getProgram, getPrograms } from "@/modules/curriculum/curriculum.query";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Chương trình đào tạo" };

export default async function Page() {
  const [student, term, courses, programs] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getPrograms()]);
  const summary = programs.find((entry) => entry.majorCode === student.majorCode && entry.cohorts.includes(student.cohort));
  const [program, enrollments, transcript, [standing]] = await Promise.all([
    summary ? getProgram(summary.id) : Promise.resolve(null),
    getStudentEnrollments(student.id, term.id),
    getTranscript(student.id),
    getStudentStandings([student.id]),
  ]);
  const grades = bestGrades(transcript);
  const timetable = pickTimetable(enrollments, grades, {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const progress: Record<string, CourseProgress> = {};
  for (const [code, letter] of Object.entries(grades)) {
    progress[code] = letter === "F" ? { status: "failed", letter } : { status: "passed", letter };
  }
  for (const { section } of timetable) {
    if (progress[section.courseCode]?.status !== "passed") progress[section.courseCode] = { status: "in-progress" };
  }

  return (
    <>
      <PageHeader
        title="Chương trình đào tạo"
        description={
          program
            ? `${program.name} (mã ngành ${program.code}), ${program.degree.toLowerCase()}, ${program.durationYears} năm, áp dụng cho khóa ${student.cohort}.`
            : `Ngành ${student.majorName}, khóa ${student.cohort}.`
        }
      />
      <StudentCurriculumProgress program={program} progress={progress} earnedCredits={standing.earnedCredits} />
    </>
  );
}
