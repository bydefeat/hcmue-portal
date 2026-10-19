import type { Metadata } from "next";
import { RegistrationHistoryList } from "@/modules/course-registration/components/registration-history-list";
import { RegistrationReceipt } from "@/modules/course-registration/components/registration-receipt";
import { pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCurrentTerm, getRegistrationEvents, getRegistrationPeriods, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PrintButton } from "@/shared/components/ui/print-button";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Lịch sử và phiếu đăng ký" };

function verificationCodeOf(value: string) {
  const hash = [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
  return hash.toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

export default async function Page() {
  const [student, term] = await Promise.all([getCurrentStudent(), getCurrentTerm()]);
  const [enrollments, periods, events] = await Promise.all([
    getStudentEnrollments(student.id, term.id),
    getRegistrationPeriods(term.id),
    getRegistrationEvents(student.id, term.id),
  ]);
  const timetable = pickTimetable(enrollments);
  const period = periods.find((entry) => entry.cohorts.includes(student.cohort)) ?? periods.at(-1);
  // Phiếu xác nhận theo lúc đóng đợt đăng ký của khóa; học kỳ chưa có đợt thì theo lần đăng ký gần nhất.
  const confirmedAt = period?.closesAt ?? events[0]?.at ?? term.startDate;
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
        <PageHeader
          title="Lịch sử và phiếu đăng ký"
          description={`${term.name}. Phiếu đăng ký có mã xác thực, in nộp khi cần đối chiếu với Phòng Đào tạo.`}
          back={{ href: "/application/registration", label: "Đăng ký học phần" }}
          actions={<PrintButton label="In phiếu đăng ký" />}
        />
        <RegistrationReceipt
          variant="screen"
          student={student}
          termName={term.name}
          enrollments={timetable}
          confirmedAt={confirmedAt}
          verificationCode={verificationCode}
        />
        <SectionCard title={`Lịch sử đăng ký ${term.shortName}`} flush>
          <p className="border-b border-border-strong px-4 py-2 text-xs text-pretty text-muted sm:px-5">
            Mọi lần đăng ký, hủy, đổi lớp, xếp từ danh sách chờ và thay đổi do Phòng Đào tạo thực hiện.
          </p>
          <RegistrationHistoryList events={events} />
        </SectionCard>
      </div>
    </>
  );
}
