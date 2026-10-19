import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { InvoiceList } from "@/modules/tuition/components/invoice-list";
import { formatMoney, PRICE_PER_CREDIT } from "@/modules/tuition/tuition.constant";
import { getInvoices } from "@/modules/tuition/tuition.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Học phí" };

export default async function Page() {
  const [student, term, courses] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses()]);
  const [enrollments, transcript] = await Promise.all([getStudentEnrollments(student.id, term.id), getTranscript(student.id)]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const invoices = await getInvoices({
    majorCode: student.majorCode,
    terms: [
      ...transcript
        .filter((entry) => !entry.isInProgress)
        .map((entry) => ({
          termId: entry.termId,
          termName: entry.termName,
          isCurrent: false,
          courses: entry.courses.map((course) => ({ code: course.courseCode, name: course.courseName, credits: course.credits })),
        })),
      {
        termId: term.id,
        termName: term.name,
        isCurrent: true,
        courses: timetable.map(({ section }) => ({ code: section.courseCode, name: section.courseName, credits: section.credits })),
      },
    ],
  });
  const price = PRICE_PER_CREDIT[student.majorCode];

  return (
    <>
      <PageHeader
        title="Học phí"
        description={
          price
            ? `Ngành ${student.majorName}: ${formatMoney(price)} mỗi tín chỉ, tính theo số tín chỉ đăng ký sau đợt điều chỉnh.`
            : `Ngành ${student.majorName} thuộc diện miễn học phí sư phạm, chỉ thu bảo hiểm y tế.`
        }
      />
      <InvoiceList invoices={invoices} studentCode={student.code} />
    </>
  );
}
