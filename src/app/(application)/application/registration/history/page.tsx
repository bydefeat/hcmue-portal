import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "defeat-icons-react";
import { RegistrationHistoryList } from "@/modules/course-registration/components/registration-history-list";
import { RegistrationReceipt } from "@/modules/course-registration/components/registration-receipt";
import { bestGrades, buildRegistrationHistory, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCurrentTerm, getRegistrationPeriods, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PrintButton } from "@/shared/components/ui/print-button";

export const metadata: Metadata = { title: "Lịch sử và phiếu đăng ký" };

function verificationCodeOf(value: string) {
  const hash = [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
  return hash.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

export default async function Page() {
  const [student, term, courses] = await Promise.all([getCurrentStudent(), getCurrentTerm(), getCourses()]);
  const [enrollments, transcript, periods] = await Promise.all([
    getStudentEnrollments(student.id, term.id),
    getTranscript(student.id),
    getRegistrationPeriods(term.id),
  ]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const period = periods.find((entry) => entry.cohorts.includes(student.cohort)) ?? periods[0];
  const events = buildRegistrationHistory(timetable, enrollments, period.opensAt, student.fullName);
  const confirmedAt = period.closesAt;
  const verificationCode = verificationCodeOf(`${student.id}:${term.id}:${timetable.map(({ section }) => section.id).join(",")}`);

  return (
    <>
      <RegistrationReceipt
        variant="print"
        student={student}
        termName={term.name}
        enrollments={timetable}
        confirmedAt={confirmedAt}
        verificationCode={verificationCode}
      />
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/application/registration" className="flex w-fit items-center gap-1 text-sm">
            <ChevronLeft size={14} aria-hidden />
            Về đăng ký học phần
          </Link>
          <PrintButton label="In phiếu đăng ký" />
        </div>
        <RegistrationReceipt
          variant="screen"
          student={student}
          termName={term.name}
          enrollments={timetable}
          confirmedAt={confirmedAt}
          verificationCode={verificationCode}
        />
        <section className="flex flex-col rounded-xl border border-border-strong bg-surface">
          <header className="border-b border-border-strong px-4 py-3 sm:px-5">
            <h2 className="text-lg font-semibold">Lịch sử đăng ký {term.shortName}</h2>
            <p className="text-xs text-muted">Mọi lần đăng ký, hủy, đổi lớp, xếp từ danh sách chờ và thay đổi do Phòng Đào tạo thực hiện.</p>
          </header>
          <RegistrationHistoryList events={events} />
        </section>
      </div>
    </>
  );
}
