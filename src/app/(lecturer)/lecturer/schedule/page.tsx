import type { Metadata } from "next";
import { PageHeader } from "@/shared/components/ui/page-header";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { WeekSchedule } from "@/modules/schedule/components/week-schedule";
import { getLecturerTimetable } from "@/modules/schedule/schedule.query";

export const metadata: Metadata = { title: "Lịch dạy" };

export default async function Page() {
  const term = await getCurrentTerm();
  const { events, sectionCount } = await getLecturerTimetable(term.id);
  const periods = events.reduce((sum, event) => sum + event.endPeriod - event.startPeriod + 1, 0);

  return (
    <>
      <PageHeader title="Lịch dạy" description={`${term.name} · ${sectionCount} lớp, ${periods} tiết mỗi tuần`} />
      <WeekSchedule events={events} termStart={term.startDate} termEnd={term.endDate} />
    </>
  );
}
