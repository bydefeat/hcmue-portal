import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses, getProgram, getPrograms } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { StudyPlanEditor } from "@/modules/study-plan/components/study-plan-editor";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { getAdvisorOf, getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Kế hoạch học tập" };

const DEFAULT_TERMS = ["Học kỳ 2, năm học 2026-2027", "Học kỳ 1, năm học 2027-2028", "Học kỳ 2, năm học 2027-2028"];

export default async function Page() {
  const [student, term, courses, programs, regulation] = await Promise.all([
    getCurrentStudent(),
    getCurrentTerm(),
    getCourses(),
    getPrograms(),
    getRegulation(),
  ]);
  const summary = programs.find((entry) => entry.majorCode === student.majorCode && entry.cohorts.includes(student.cohort));
  const [program, plan, advisor, transcript, enrollments] = await Promise.all([
    summary ? getProgram(summary.id) : Promise.resolve(null),
    getStudyPlanOfStudent(student.id),
    getAdvisorOf(student.id),
    getTranscript(student.id),
    getStudentEnrollments(student.id, term.id),
  ]);
  const passedGrades = bestGrades(transcript);
  const prerequisites = Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]));
  const inProgress = new Set(pickTimetable(enrollments, passedGrades, { faculty: student.faculty, prerequisites }).map(({ section }) => section.courseCode));
  const isOpenCourse = (code: string) => (!passedGrades[code] || passedGrades[code] === "F") && !inProgress.has(code);
  const plannedCodes = new Set(plan?.terms.flatMap((entry) => entry.courses.map((course) => course.code)) ?? []);
  const pool = (program?.semesters.flatMap((semester) => semester.courses) ?? [])
    .filter((course) => isOpenCourse(course.code) && !plannedCodes.has(course.code))
    .map((course) => ({ code: course.code, name: course.name, credits: course.credits }));
  const termNames = [...new Set([...(plan?.terms.map((entry) => entry.termName) ?? []), ...DEFAULT_TERMS])].slice(0, 3);

  return (
    <>
      <PageHeader
        title="Kế hoạch học tập"
        description="Xếp học phần cho các học kỳ tới. Kế hoạch được cố vấn duyệt là căn cứ để Phòng Đào tạo mở lớp và để bạn đăng ký học phần."
      />
      <StudyPlanEditor
        plan={plan}
        termNames={termNames}
        pool={pool}
        passedGrades={passedGrades}
        prerequisites={prerequisites}
        limits={{ min: regulation.credits.minPerTerm, max: regulation.credits.maxPerTerm }}
        advisorName={advisor?.displayName ?? null}
      />
    </>
  );
}
