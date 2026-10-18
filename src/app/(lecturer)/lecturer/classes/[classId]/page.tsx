import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Megaphone } from "defeat-icons-react";
import { ClassRosterTable } from "@/modules/course-registration/components/class-roster-table";
import { getClassRoster, getClassSection } from "@/modules/course-registration/course-registration.query";
import { EXAM_KIND_LABEL } from "@/modules/exams/exams.constant";
import { getExamsForClassSections } from "@/modules/exams/exams.query";
import { getClassAnnouncements } from "@/modules/teaching/teaching.query";
import { weekdayLabel } from "@/shared/constants/period.constant";
import { formatDate, weekdayOf } from "@/shared/libs/date.lib";

export const metadata: Metadata = { title: "Danh sách lớp" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const [section, roster, exams, announcements] = await Promise.all([
    getClassSection(classId),
    getClassRoster(classId),
    getExamsForClassSections([classId]),
    getClassAnnouncements(classId),
  ]);
  const latest = announcements.find((announcement) => announcement.status === "published");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface px-4 py-3 text-sm sm:px-5 lg:flex-row lg:items-center lg:gap-6">
        <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <CalendarClock size={16} aria-hidden className="shrink-0 text-muted" />
          {exams.length === 0 ? (
            <span className="text-muted">Chưa có lịch thi cho lớp này</span>
          ) : (
            exams.map((exam) => (
              <span key={exam.id} className="tabular-nums">
                <span className="text-muted">Thi {EXAM_KIND_LABEL[exam.kind].toLowerCase()}:</span> {weekdayLabel(weekdayOf(exam.date))},{" "}
                {formatDate(exam.date)}, {exam.startTime}, phòng {exam.room}
              </span>
            ))
          )}
        </span>
        <Link href={`/lecturer/classes/${classId}/announcements`} className="flex min-w-0 items-center gap-2 lg:ml-auto lg:max-w-md">
          <Megaphone size={16} aria-hidden className="shrink-0" />
          <span className="truncate">{latest ? `Thông báo mới nhất: ${latest.title}` : "Gửi thông báo cho lớp"}</span>
        </Link>
      </div>
      <ClassRosterTable roster={roster} classCode={section?.code ?? ""} />
    </div>
  );
}
