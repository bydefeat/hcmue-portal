import type { Metadata } from "next";
import { StudentRegistration } from "@/modules/course-registration/components/student-registration";
import { bestGrades, evaluateSection, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";
import {
  getClassSections,
  getCurrentTerm,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getStudentEnrollments,
} from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { formatDate } from "@/shared/libs/date.lib";
import { formatMoney } from "@/modules/tuition/tuition.constant";
import { getInvoices } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Đăng ký học phần" };

export default async function Page() {
  const [student, currentTerm, targetTerm, courses, regulation] = await Promise.all([
    getCurrentStudent(),
    getCurrentTerm(),
    getRegistrationTargetTerm(),
    getCourses(),
    getRegulation(),
  ]);
  const [sections, periods, transcript, plan, enrollments] = await Promise.all([
    getClassSections(targetTerm.id),
    getRegistrationPeriods(targetTerm.id),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
    getStudentEnrollments(student.id, currentTerm.id),
  ]);

  const passedGrades = bestGrades(transcript);
  const prerequisites = Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]));
  const courseNames = Object.fromEntries(courses.map((course) => [course.code, course.name]));
  const openSections = sections.filter((section) => section.status === "open");
  const period = periods.find((entry) => entry.cohorts.includes(student.cohort)) ?? null;
  const planCodes = plan?.terms[0]?.courses.map((course) => course.code) ?? [];

  const timetable = pickTimetable(enrollments, passedGrades, { faculty: student.faculty, prerequisites });
  const inProgressCodes = timetable.map(({ section }) => section.courseCode);

  const initialPlanned: ClassSectionView[] = [];
  for (const section of openSections) {
    if (initialPlanned.length >= 2) break;
    const issues = evaluateSection(section, {
      planned: initialPlanned,
      passedGrades,
      prerequisites,
      courseNames,
      maxCredits: regulation.credits.maxPerTerm,
      inProgressCodes,
    });
    if (issues.length === 0 && section.faculty === student.faculty) initialPlanned.push(section);
  }

  const [currentInvoice] = await getInvoices({
    majorCode: student.majorCode,
    terms: [
      {
        termId: currentTerm.id,
        termName: currentTerm.name,
        isCurrent: true,
        courses: timetable.map(({ section }) => ({ code: section.courseCode, name: section.courseName, credits: section.credits })),
      },
    ],
  });
  const tuitionWarning =
    currentInvoice && currentInvoice.balance > 0
      ? currentInvoice.status === "overdue"
        ? `Học phí ${currentTerm.shortName} quá hạn, còn nợ ${formatMoney(currentInvoice.balance)}. Tài khoản bị khóa đăng ký cho đến khi nộp đủ.`
        : `Học phí ${currentTerm.shortName} còn ${formatMoney(currentInvoice.balance)}, hạn ${formatDate(currentInvoice.dueDate)}. Quá hạn sẽ bị khóa đăng ký.`
      : null;

  return (
    <StudentRegistration
      sections={openSections}
      period={period}
      termName={targetTerm.name}
      cohort={student.cohort}
      passedGrades={passedGrades}
      prerequisites={prerequisites}
      courseNames={courseNames}
      credits={{ min: regulation.credits.minPerTerm, max: regulation.credits.maxPerTerm }}
      planCodes={planCodes}
      inProgressCodes={inProgressCodes}
      initialPlannedIds={initialPlanned.map((section) => section.id)}
      tuitionWarning={tuitionWarning}
    />
  );
}
