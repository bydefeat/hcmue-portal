"use client";

import { useState } from "react";
import type { Dayjs } from "dayjs";
import Link from "next/link";
import { Select } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { BREAKS, PERIODS, periodLabel, periodTimeRange, WEEKDAYS } from "@/shared/constants/period.constant";
import { dayjs, formatShortDate, weekdayOf } from "@/shared/libs/date.lib";
import type { ScheduleEvent } from "../schedule.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type WeekScheduleProps = {
  events: ScheduleEvent[];
  termStart: string;
  termEnd: string;
};

function startOfWeek(value: Dayjs) {
  return value.startOf("day").subtract(weekdayOf(value) - 2, "day");
}

function termWeeks(termStart: string, termEnd: string) {
  const first = startOfWeek(dayjs(termStart));
  const last = dayjs(termEnd);
  const weeks: Dayjs[] = [];
  for (let week = first; !week.isAfter(last, "day"); week = week.add(1, "week")) weeks.push(week);
  return weeks;
}

function EventBlock({ event, compact = false }: { event: ScheduleEvent; compact?: boolean }) {
  const body = (
    <>
      <span className="text-xs text-muted">{event.code}</span>
      <span className="line-clamp-2 text-sm font-medium text-pretty">{event.title}</span>
      <span className="text-xs text-muted tabular-nums">
        {periodLabel(event.startPeriod, event.endPeriod)} · {event.room}
      </span>
      {compact && <span className="text-xs text-muted tabular-nums">{periodTimeRange(event.startPeriod, event.endPeriod)}</span>}
    </>
  );
  const className =
    "flex h-full min-w-0 flex-col gap-0.5 overflow-hidden rounded-lg border border-primary/20 bg-primary-light p-2 text-foreground transition-colors";
  if (!event.href) return <div className={className}>{body}</div>;
  return (
    <Link href={event.href} className={`${className} cursor-pointer hover:bg-primary/10`}>
      {body}
    </Link>
  );
}


function rowOf(period: number) {
  return period + 1 + BREAKS.filter((entry) => entry.afterPeriod < period).length;
}

const GRID_ROWS = [
  "auto",
  ...PERIODS.flatMap((period) => {
    const pause = BREAKS.find((entry) => entry.afterPeriod === period.period);
    return pause ? ["44px", pause.afterPeriod === 6 ? "28px" : "20px"] : ["44px"];
  }),
].join(" ");

export function WeekSchedule({ events, termStart, termEnd }: WeekScheduleProps) {
  const weeks = termWeeks(termStart, termEnd);
  const currentWeek = startOfWeek(dayjs());
  const [weekStart, setWeekStart] = useState(() => {
    if (currentWeek.isBefore(weeks[0], "day")) return weeks[0];
    if (currentWeek.isAfter(weeks.at(-1), "day")) return weeks.at(-1) ?? currentWeek;
    return currentWeek;
  });
  const today = dayjs().startOf("day");
  const isInTerm = !weekStart.add(6, "day").isBefore(termStart) && !weekStart.isAfter(termEnd);
  const visibleEvents = isInTerm ? events : [];
  const days = WEEKDAYS.map((day, index) => ({ ...day, date: weekStart.add(index, "day") }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Chọn tuần"
          value={weekStart.valueOf()}
          onChange={(value) => setWeekStart(dayjs(value))}
          showSearch={{ optionFilterProp: "label" }}
          className="w-full sm:w-80"
          options={weeks.map((week, index) => ({
            value: week.valueOf(),
            label: `Tuần ${index + 1}: ${formatShortDate(week)} - ${week.add(6, "day").format("DD/MM/YYYY")}${week.isSame(currentWeek, "day") ? " (tuần này)" : ""}`,
          }))}
        />
      </div>

      {visibleEvents.length === 0 ? (
        <SectionCard flush>
          <EmptyState
            illustration="calendar"
            title="Tuần đã chọn không có lịch"
            description={isInTerm ? "Chưa có lớp học phần nào xếp lịch trong tuần." : "Tuần đang xem nằm ngoài thời gian học kỳ."}
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard flush className="hidden md:block">
            <div className="overflow-x-auto">
              <div
                className="grid min-w-[880px]"
                style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))", gridTemplateRows: GRID_ROWS }}
              >
                <div className="border-b border-border-strong" />
                {days.map((day, index) => {
                  const isToday = day.date.isSame(today, "day");
                  return (
                    <div
                      key={day.value}
                      style={{ gridColumn: index + 2, gridRow: 1 }}
                      className={`flex flex-col items-center gap-0.5 border-b border-l border-border-strong py-2 ${isToday ? "bg-primary-light" : ""}`}
                    >
                      <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted"}`}>{day.label}</span>
                      <span className={`text-sm tabular-nums ${isToday ? "font-semibold text-primary" : ""}`}>{formatShortDate(day.date)}</span>
                    </div>
                  );
                })}
                {PERIODS.map((period) => (
                  <div
                    key={period.period}
                    style={{ gridColumn: 1, gridRow: rowOf(period.period) }}
                    className="flex flex-col justify-center border-b border-border px-2 text-xs text-muted tabular-nums"
                  >
                    <span className="font-medium text-foreground">Tiết {period.period}</span>
                    {period.start}
                  </div>
                ))}
                {days.map((day, dayIndex) =>
                  PERIODS.map((period) => (
                    <div
                      key={`${day.value}-${period.period}`}
                      style={{ gridColumn: dayIndex + 2, gridRow: rowOf(period.period) }}
                      className={`border-b border-l border-border ${day.date.isSame(today, "day") ? "bg-primary-light" : ""}`}
                    />
                  )),
                )}
                {BREAKS.map((pause) => (
                  <div
                    key={pause.afterPeriod}
                    style={{ gridColumn: "1 / -1", gridRow: rowOf(pause.afterPeriod) + 1 }}
                    className="flex items-center gap-2 border-b border-border bg-background px-2 text-xs text-muted tabular-nums"
                  >
                    <span className="font-medium">{pause.label}</span>
                    {pause.start} - {pause.end}
                  </div>
                ))}
                {visibleEvents.map((event) => {
                  const dayIndex = WEEKDAYS.findIndex((day) => day.value === event.dayOfWeek);
                  return (
                    <div
                      key={event.id}
                      style={{ gridColumn: dayIndex + 2, gridRow: `${rowOf(event.startPeriod)} / ${rowOf(event.endPeriod) + 1}` }}
                      className="z-10 p-1"
                    >
                      <EventBlock event={event} />
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          <div className="flex flex-col gap-3 md:hidden">
            {days
              .map((day) => ({ day, items: visibleEvents.filter((event) => event.dayOfWeek === day.value).sort((a, b) => a.startPeriod - b.startPeriod) }))
              .filter(({ items }) => items.length > 0)
              .map(({ day, items }) => {
                const isToday = day.date.isSame(today, "day");
                return (
                  <section key={day.value} className="flex flex-col gap-2">
                    <h2 className={`flex items-baseline gap-2 text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                      {day.label}
                      <span className="text-xs font-normal text-muted tabular-nums">
                        {formatShortDate(day.date)}
                        {isToday ? " · Hôm nay" : ""}
                      </span>
                    </h2>
                    {items.map((event) => (
                      <EventBlock key={event.id} event={event} compact />
                    ))}
                  </section>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
