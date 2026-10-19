import type { Metadata } from "next";
import { getCurrentTerm } from "@/modules/course-registration/course-registration.query";
import { IcsExportButton } from "@/modules/schedule/components/ics-export-button";
import { WeekSchedule } from "@/modules/schedule/components/week-schedule";
import { getStudentTimetable } from "@/modules/schedule/schedule.query";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thời khóa biểu" };

export default async function Page() {
  const [student, term] = await Promise.all([getCurrentStudent(), getCurrentTerm()]);
  const { events, sectionCount, credits } = await getStudentTimetable(term.id);
  const periods = events.reduce((sum, event) => sum + event.endPeriod - event.startPeriod + 1, 0);

  return (
    <>
      <PageHeader
        title="Thời khóa biểu"
        description={`${term.name} · ${sectionCount} lớp, ${credits} tín chỉ, ${periods} tiết mỗi tuần`}
        actions={
          <IcsExportButton
            events={events}
            termStart={term.startDate}
            termEnd={term.endDate}
            calendarName={`Thời khóa biểu ${term.shortName}`}
            fileName={`tkb-${student.code}-${term.code}.ics`}
          />
        }
      />
      <WeekSchedule events={events} termStart={term.startDate} termEnd={term.endDate} />
    </>
  );
}
