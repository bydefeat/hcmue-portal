import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { getCurrentTerm, getLecturerClassSections } from "@/modules/course-registration/course-registration.query";
import { WeekSchedule } from "@/modules/schedule/components/week-schedule";
import type { ScheduleEvent } from "@/modules/schedule/schedule.type";
import { getCurrentLecturer } from "@/modules/users/users.query";

export const metadata: Metadata = { title: "Lịch dạy" };

export default async function Page() {
  const [lecturer, term] = await Promise.all([getCurrentLecturer(), getCurrentTerm()]);
  const sections = await getLecturerClassSections(lecturer.id, term.id);
  const events: ScheduleEvent[] = sections.flatMap((section) =>
    section.meetings.map((meeting, index) => ({
      id: `${section.id}-${index}`,
      title: section.courseName,
      code: section.code,
      dayOfWeek: meeting.dayOfWeek,
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      room: meeting.room,
      href: `/lecturer/classes/${section.id}`,
    })),
  );
  const periods = events.reduce((sum, event) => sum + event.endPeriod - event.startPeriod + 1, 0);

  return (
    <>
      <PageHeader title="Lịch dạy" description={`${term.name} · ${sections.length} lớp, ${periods} tiết mỗi tuần`} />
      <WeekSchedule events={events} termStart={term.startDate} termEnd={term.endDate} />
    </>
  );
}
