import type { Metadata } from "next";
import { AdvisorContactCard, StudentAppointmentList } from "@/modules/advising/components/student-appointment-list";
import { getMyAdvisor, getMyAppointments } from "@/modules/advising/advising.query";
import { splitAppointments } from "@/modules/advising/advising.rule";
import { PageHeader } from "@/shared/components/ui/page-header";
import { dayjs } from "@/shared/libs/date.lib";

export const metadata: Metadata = { title: "Lịch hẹn cố vấn" };

export default async function Page() {
  const [appointments, advisor] = await Promise.all([getMyAppointments(), getMyAdvisor()]);
  const { upcoming, past } = splitAppointments(appointments, dayjs());
  return (
    <>
      <PageHeader
        title="Lịch hẹn cố vấn"
        description={upcoming.length > 0 ? `${upcoming.length} buổi hẹn sắp tới với cố vấn học tập.` : "Các buổi cố vấn học tập hẹn gặp bạn."}
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <StudentAppointmentList upcoming={upcoming} past={past} />
        </div>
        <div className="min-w-0">
          <AdvisorContactCard advisor={advisor} />
        </div>
      </div>
    </>
  );
}
