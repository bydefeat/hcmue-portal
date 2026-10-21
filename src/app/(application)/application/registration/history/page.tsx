import type { Metadata } from "next";
import { downloadRegistrationReceiptPdf } from "@/modules/course-registration/course-registration.action";
import { RegistrationHistoryList } from "@/modules/course-registration/components/registration-history-list";
import { RegistrationReceipt } from "@/modules/course-registration/components/registration-receipt";
import { HistoryTermSelect } from "@/modules/course-registration/components/history-term-select";
import { pickTimetable, receiptConfirmedAt, receiptVerificationCode } from "@/modules/course-registration/course-registration.rule";
import { getRegistrationEvents, getRegistrationPeriods, getRegistrationTargetTerm, getStudentEnrollments, getTerms } from "@/modules/course-registration/course-registration.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { DownloadPdfButton } from "@/shared/components/ui/download-pdf-button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PrintButton } from "@/shared/components/ui/print-button";
import { SectionCard } from "@/shared/components/ui/section-card";

export const metadata: Metadata = { title: "Lịch sử và phiếu đăng ký" };

export default async function Page({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const [{ term: termParam }, student, terms, targetTerm] = await Promise.all([searchParams, getCurrentStudent(), getTerms(), getRegistrationTargetTerm()]);
  const term = terms.find((entry) => entry.id === termParam) ?? targetTerm;
  const [enrollments, periods, events] = await Promise.all([getStudentEnrollments(student.id, term.id), getRegistrationPeriods(term.id), getRegistrationEvents(student.id, term.id)]);
  const timetable = pickTimetable(enrollments);
  const confirmedAt = receiptConfirmedAt(periods, student.cohort, events, term.startDate);
  const verificationCode = receiptVerificationCode(student.id, term.id, timetable.map(({ section }) => section.id));
  const choices = terms
    .filter((entry) => entry.startDate <= targetTerm.startDate)
    .toSorted((a, b) => b.startDate.localeCompare(a.startDate))
    .map((entry) => ({ value: entry.id, label: entry.name }));

  return (
    <>
      <RegistrationReceipt variant="print" student={student} termName={term.name} enrollments={timetable} confirmedAt={confirmedAt} verificationCode={verificationCode} />
      <div className="flex flex-col gap-4 print:hidden">
        <PageHeader
          title="Lịch sử và phiếu đăng ký"
          description={`${term.name}. Phiếu đăng ký có mã xác thực, in nộp khi cần đối chiếu với Phòng Đào tạo.`}
          back={{ href: "/application/registration", label: "Đăng ký học phần" }}
          actions={
            <>
              <DownloadPdfButton action={downloadRegistrationReceiptPdf.bind(null, term.id)} />
              <PrintButton label="In phiếu đăng ký" />
            </>
          }
        />
        <HistoryTermSelect value={term.id} options={choices} />
        <RegistrationReceipt variant="screen" student={student} termName={term.name} enrollments={timetable} confirmedAt={confirmedAt} verificationCode={verificationCode} />
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
