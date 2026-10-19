import type { Metadata } from "next";
import { AppointmentBoard } from "@/modules/advising/components/appointment-board";
import { getAppointments, getMeetingNotes } from "@/modules/advising/advising.query";
import { getAdvisees, getCurrentLecturer } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Lịch hẹn cố vấn" };

export default async function Page() {
  const lecturer = await getCurrentLecturer();
  const [appointments, advisees] = await Promise.all([getAppointments(lecturer.id), getAdvisees(lecturer.id)]);
  const notes = await getMeetingNotes(advisees.map((student) => student.id));

  return (
    <>
      <PageHeader
        title="Lịch hẹn"
        description="Hẹn gặp sinh viên cố vấn, ghi lại nội dung trao đổi để theo dõi qua các học kỳ. Sinh viên nhận lời mời qua email và cổng sinh viên."
      />
      <AppointmentBoard
        appointments={appointments}
        advisees={advisees.map(({ id, code, fullName, className }) => ({ id, code, fullName, className }))}
        notes={notes}
      />
    </>
  );
}
