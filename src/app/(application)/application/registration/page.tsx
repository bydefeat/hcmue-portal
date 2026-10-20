import type { Metadata } from "next";
import Link from "next/link";
import { StudentRegistration } from "@/modules/course-registration/components/student-registration";
import { applicablePeriod, inProgressCodesFor, lastAttemptGrades } from "@/modules/course-registration/course-registration.rule";
import type { RegistrationHold } from "@/modules/course-registration/course-registration.type";
import {
  getClassSections,
  getCreditLimits,
  getCurrentTerm,
  getRegistrationHolds,
  getRegistrationPeriods,
  getRegistrationTargetTerm,
  getStudentEnrollments,
  getStudentWaitlist,
} from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { getStudyPlanOfStudent } from "@/modules/study-plan/study-plan.query";
import { tuitionBlockOf } from "@/modules/tuition/tuition.rule";
import { getInvoices } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Đăng ký học phần" };

export default async function Page() {
  const [student, currentTerm, targetTerm, courses] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getRegistrationTargetTerm(), getCourses()]);
  const [sections, periods, transcript, plan, enrollments, holds, targetEnrollments, waitlist, credit, invoices] = await Promise.all([
    getClassSections(targetTerm.id),
    getRegistrationPeriods(targetTerm.id),
    getTranscript(student.id),
    getStudyPlanOfStudent(student.id),
    getStudentEnrollments(student.id, currentTerm.id),
    getRegistrationHolds(student.id),
    getStudentEnrollments(student.id, targetTerm.id),
    getStudentWaitlist(student.id, targetTerm.id),
    getCreditLimits(student.id, targetTerm.id),
    getInvoices(student.id),
  ]);

  // Cùng nguồn với server: điểm lần học cuối, đợt áp dụng (đang mở > sắp mở > vừa đóng), hạn mức tính bởi creditLimitsFor.
  const passedGrades = lastAttemptGrades(transcript);
  const prerequisites = Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes]));
  const corequisites = Object.fromEntries(courses.map((course) => [course.code, course.corequisiteCodes]));
  const equivalents = Object.fromEntries(courses.map((course) => [course.code, course.equivalentCodes]));
  const profile = { majorCode: student.majorCode, cohort: student.cohort };
  const courseNames = Object.fromEntries(courses.map((course) => [course.code, course.name]));
  const openSections = sections.filter((section) => section.status === "open");
  const period = applicablePeriod(periods, student.cohort);
  const planCodes = (plan?.terms[0]?.courses.map((course) => course.code) ?? []).filter((code) => !passedGrades[code] || passedGrades[code] === "F");
  const inProgressCodes = inProgressCodesFor(targetTerm.id, currentTerm.id, enrollments.map(({ section }) => section.courseCode));
  const limits = credit?.limits ?? { min: 0, max: 0 };

  const initialLabChoices = Object.fromEntries(
    targetEnrollments.filter((entry) => entry.labGroupId).map((entry) => [entry.section.id, entry.labGroupId as string]),
  );

  // Mọi khóa đang có hiệu lực (cán bộ đặt, kể cả khóa học phí) và khóa tính từ hóa đơn học kỳ hiện tại, cùng điều kiện server chặn.
  const currentInvoice = invoices.find((invoice) => invoice.termId === currentTerm.id);
  const tuition = tuitionBlockOf(currentInvoice, currentTerm.shortName);
  const tuitionHold: RegistrationHold | null =
    tuition && currentInvoice
      ? {
          id: `hoc-phi-${currentTerm.id}`,
          studentId: student.id,
          studentCode: student.code,
          studentName: student.fullName,
          className: student.className,
          faculty: student.faculty,
          kind: "tuition",
          blocking: tuition.blocking,
          reason: tuition.reason,
          resolveHint: tuition.resolveHint,
          createdAt: currentInvoice.issuedAt,
          createdBy: "Phòng Kế hoạch - Tài chính",
          releasedAt: null,
          releasedBy: null,
        }
      : null;
  const allHolds = [...(tuitionHold ? [tuitionHold] : []), ...holds.filter((hold) => !hold.releasedAt)];

  return (
    <>
      <PageHeader
        title="Đăng ký học phần"
        description={`${targetTerm.name}. Hệ thống kiểm tra tiên quyết, trùng lịch, sĩ số và hạn mức tín chỉ ngay khi bạn chọn lớp.`}
        actions={<Link href={`/application/registration/history?term=${targetTerm.id}`}>Lịch sử và phiếu đăng ký</Link>}
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
        credits={limits}
        planCodes={planCodes}
        inProgressCodes={inProgressCodes}
        initialRegisteredIds={targetEnrollments.map((entry) => entry.section.id)}
        initialLabChoices={initialLabChoices}
        initialWaitlist={waitlist}
        holds={allHolds}
      />
    </>
  );
}
