import Link from "next/link";
import { ChevronRight, PresentationScreen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { periodLabel, periodTimeRange, weekdayLabel } from "@/shared/constants/period.constant";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { weekdayOf } from "@/shared/libs/date.lib";
import type { ClassSectionView } from "../course-registration.type";

export type LecturerClassItem = {
  section: ClassSectionView;
  gradeStatus: StatusMeta;
  gradeNote: string;
};

const TONE_RANK = { danger: 0, warning: 1, neutral: 2, success: 3 } as const;

export function sectionScheduleText(section: Pick<ClassSectionView, "meetings">) {
  return section.meetings
    .map((meeting) => `${weekdayLabel(meeting.dayOfWeek)}, ${periodLabel(meeting.startPeriod, meeting.endPeriod)} (${periodTimeRange(meeting.startPeriod, meeting.endPeriod)}), phòng ${meeting.room}`)
    .join("; ");
}

export function LecturerClassList({ items }: { items: LecturerClassItem[] }) {
  const today = weekdayOf(new Date());
  const rows = items
    .map((item) => ({ ...item, todayMeeting: item.section.meetings.find((meeting) => meeting.dayOfWeek === today) }))
    .sort(
      (a, b) =>
        Number(Boolean(b.todayMeeting)) - Number(Boolean(a.todayMeeting)) ||
        TONE_RANK[a.gradeStatus.tone] - TONE_RANK[b.gradeStatus.tone] ||
        a.section.code.localeCompare(b.section.code),
    );

  if (rows.length === 0) {
    return (
      <SectionCard flush>
        <EmptyState icon={PresentationScreen} title="Chưa được phân công lớp" description="Học kỳ này bạn chưa có lớp học phần nào. Liên hệ khoa nếu thấy thiếu lớp." />
      </SectionCard>
    );
  }

  return (
    <SectionCard flush className="overflow-hidden">
      <ul className="flex flex-col divide-y divide-border-strong">
        {rows.map(({ section, gradeStatus, gradeNote, todayMeeting }) => (
          <li key={section.id}>
            <Link
              href={`/lecturer/classes/${section.id}`}
              className="flex cursor-pointer items-center gap-4 p-4 text-foreground transition-colors hover:bg-surface-hover sm:px-5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-medium text-pretty">{section.courseName}</span>
                  <span className="text-xs text-muted">{section.code}</span>
                </div>
                {todayMeeting ? (
                  <p className="text-sm font-medium text-primary tabular-nums">
                    Hôm nay, {periodTimeRange(todayMeeting.startPeriod, todayMeeting.endPeriod)}, phòng {todayMeeting.room}
                  </p>
                ) : (
                  <p className="text-sm text-pretty text-muted">{sectionScheduleText(section)}</p>
                )}
              </div>
              <div className="hidden shrink-0 flex-col items-end gap-1 text-sm sm:flex">
                <span className="tabular-nums">
                  <span className="font-medium">{section.enrolled}</span>
                  <span className="text-muted">/{section.capacity} SV</span>
                </span>
                <span className="text-xs text-muted tabular-nums">{section.credits} tín chỉ</span>
              </div>
              <div className="flex w-32 shrink-0 flex-col items-end gap-1 sm:w-40">
                <StatusTag status={gradeStatus} />
                <span className="text-right text-xs text-muted tabular-nums">{gradeNote}</span>
              </div>
              <ChevronRight size={16} aria-hidden className="hidden shrink-0 text-muted sm:block" />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
