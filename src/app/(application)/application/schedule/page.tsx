import type { Metadata } from "next";
import { getCurrentTerm, getStudentEnrollments } from "@/modules/course-registration/course-registration.query";
import { bestGrades, pickTimetable } from "@/modules/course-registration/course-registration.rule";
import { getCourses } from "@/modules/curriculum/curriculum.query";
import { getTranscript } from "@/modules/grades/grades.query";
import { IcsExportButton } from "@/modules/schedule/components/ics-export-button";
import { WeekSchedule } from "@/modules/schedule/components/week-schedule";
import type { ScheduleEvent } from "@/modules/schedule/schedule.type";
import { getCurrentStudent } from "@/modules/users/users.query";
import { PageHeader } from "@/shared/components/ui/page-header";

export const metadata: Metadata = { title: "Thời khóa biểu" };

export default async function Page() {
  const [student, term] = await Promise.all([getCurrentStudent(), getCurrentTerm()]);
  const [enrollments, transcript, courses] = await Promise.all([getStudentEnrollments(student.id, term.id), getTranscript(student.id), getCourses()]);
  const timetable = pickTimetable(enrollments, bestGrades(transcript), {
    faculty: student.faculty,
    prerequisites: Object.fromEntries(courses.map((course) => [course.code, course.prerequisiteCodes])),
  });
  const events: ScheduleEvent[] = timetable.flatMap(({ section }) =>
    section.meetings.map((meeting, index) => ({
      id: `${section.id}-${index}`,
      title: section.courseName,
      code: section.code,
      dayOfWeek: meeting.dayOfWeek,
      startPeriod: meeting.startPeriod,
      endPeriod: meeting.endPeriod,
      room: meeting.room,
    })),
  );
  const credits = timetable.reduce((sum, { section }) => sum + section.credits, 0);
  const periods = events.reduce((sum, event) => sum + event.endPeriod - event.startPeriod + 1, 0);

  return (
    <>
      <PageHeader
        title="Thời khóa biểu"
        description={`${term.name} · ${timetable.length} lớp, ${credits} tín chỉ, ${periods} tiết mỗi tuần`}
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
