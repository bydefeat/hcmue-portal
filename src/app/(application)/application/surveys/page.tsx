import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { StudentSurveyList } from "@/modules/surveys/components/student-survey-list";
import { getStudentSurveyTasks, getSurvey } from "@/modules/surveys/surveys.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Khảo sát giảng dạy" };

export default async function Page() {
  const [student, term, courses, survey] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses(), getSurvey()]);
  const [enrollments, transcript] = await Promise.all([getStudentEnrollments(student.id, term.id), getTranscript(student.id)]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const tasks = await getStudentSurveyTasks(
    timetable.map(({ section }) => ({ id: section.id, code: section.code, courseName: section.courseName, lecturerName: section.lecturerName })),
  );

  return (
    <>
      <PageHeader title="Khảo sát giảng dạy" description="Ý kiến của bạn giúp khoa cải thiện chất lượng giảng dạy. Mỗi lớp chỉ đánh giá một lần." />
      <StudentSurveyList survey={survey} tasks={tasks} />
    </>
  );
}
