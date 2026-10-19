import type { Metadata } from "next";
import Link from "next/link";
import { StudentRegistration } from "@/modules/course-registration/components/student-registration";
import { bestGrades, creditCapOf, evaluateSection, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import type { ClassSectionView, RegistrationHold } from "@/modules/course-registration/course-registration.type";
import {
  getClassSections,
  getCurrentTerm,
  getRegistrationHolds,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getStudentEnrollments,
} from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getStudentStandings, getTranscript } from "@/modules/grades/grades.query";
import { getRegulation } from "@/modules/settings/settings.query";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { formatDate } from "@/shared/libs/date.lib";
import { formatMoney } from "@/modules/tuition/tuition.constant";
import { getInvoices } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Đăng ký học phần" };

export default async function Page() {
  const [student, currentTerm, targetTerm, courses, regulation] = await Promise.all([
    getCurrentStudent(),
    getCurrentTerm(),
    getRegistrationTargetTerm(),
    getCourses(),
    getRegulation(),
  ]);
  const [sections, periods, transcript, plan, enrollments, holds, [standing]] = await Promise.all([
    getClassSections(targetTerm.id),
    getRegistrationPeriods(targetTerm.id),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
    getStudentEnrollments(student.id, currentTerm.id),
    getRegistrationHolds(student.id),
    getStudentStandings([student.id]),
  ]);

  const passedGrades = bestGrades(transcript);
  const prerequisites = Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]));
  const corequisites = Object.fromEntries(courses.map((course) => [course.code, course.corequisiteCodes]));
  const equivalents = Object.fromEntries(courses.map((course) => [course.code, course.equivalentCodes]));
  const cap = creditCapOf(regulation.credits, standing.warningLevel);
  const profile = { majorCode: student.majorCode, cohort: student.cohort };
  const courseNames = Object.fromEntries(courses.map((course) => [course.code, course.name]));
  const openSections = sections.filter((section) => section.status === "open");
  const period = periods.find((entry) => entry.cohorts.includes(student.cohort)) ?? null;
  const planCodes = (plan?.terms[0]?.courses.map((course) => course.code) ?? []).filter((code) => !passedGrades[code] || passedGrades[code] === "F");

  const timetable = pickTimetable(enrollments, passedGrades, { faculty: student.faculty, prerequisites });
  const inProgressCodes = timetable.map(({ section }) => section.courseCode);

  const initialPlanned: ClassSectionView[] = [];
  const initialLabChoices: Record<string, string> = {};
  for (const section of openSections) {
    if (initialPlanned.length >= 2) break;
    const issues = evaluateSection(section, {
      planned: initialPlanned,
      passedGrades,
      prerequisites,
      corequisites,
      equivalents,
      courseNames,
      maxCredits: cap.max,
      inProgressCodes,
      student: profile,
    }).filter((issue) => issue.blocking);
    if (issues.length > 0 || section.faculty !== student.faculty) continue;
    const lab = section.labGroups.find((group) => group.enrolled < group.capacity);
    if (section.labGroups.length > 0 && !lab) continue;
    if (lab) initialLabChoices[section.id] = lab.id;
    initialPlanned.push(section);
  }

  const currentInvoice = (await getInvoices(student.id)).find((invoice) => invoice.termId === currentTerm.id);
  const tuitionHold: RegistrationHold | null =
    currentInvoice && currentInvoice.balance > 0
      ? {
          id: `hoc-phi-${currentTerm.id}`,
          studentId: student.id,
          studentCode: student.code,
          studentName: student.fullName,
          className: student.className,
          faculty: student.faculty,
          kind: "tuition",
          blocking: currentInvoice.status === "overdue",
          reason:
            currentInvoice.status === "overdue"
              ? `Học phí ${currentTerm.shortName} quá hạn, còn nợ ${formatMoney(currentInvoice.balance)}`
              : `Học phí ${currentTerm.shortName} còn ${formatMoney(currentInvoice.balance)}, hạn ${formatDate(currentInvoice.dueDate)}`,
          resolveHint:
            currentInvoice.status === "overdue"
              ? "Nộp đủ học phí, khóa đăng ký tự gỡ sau 1 ngày làm việc"
              : "Nộp trước hạn để không bị khóa đăng ký học kỳ sau",
          createdAt: currentInvoice.dueDate,
          createdBy: "Phòng Kế hoạch - Tài chính",
          releasedAt: null,
          releasedBy: null,
        }
      : null;
  const allHolds = [...(tuitionHold ? [tuitionHold] : []), ...holds.filter((hold) => hold.kind !== "tuition")];

  return (
    <>
      <PageHeader
        title="Đăng ký học phần"
        description={`${targetTerm.name}. Hệ thống kiểm tra tiên quyết, trùng lịch, sĩ số và hạn mức tín chỉ ngay khi bạn chọn lớp.`}
        actions={<Link href="/application/registration/history">Lịch sử và phiếu đăng ký</Link>}
      />
      <StudentRegistration
        sections={openSections}
        period={period}
        cohort={student.cohort}
        student={profile}
        passedGrades={passedGrades}
        prerequisites={prerequisites}
        corequisites={corequisites}
        equivalents={equivalents}
        courseNames={courseNames}
        credits={{ min: regulation.credits.minPerTerm, max: cap.max, note: cap.note }}
        planCodes={planCodes}
        inProgressCodes={inProgressCodes}
        initialPlannedIds={initialPlanned.map((section) => section.id)}
        initialLabChoices={initialLabChoices}
        holds={allHolds}
      />
    </>
  );
}
