"use client";

import { useState } from "react";
import type { Dayjs } from "dayjs";
import Link from "next/link";
import { Button } from "antd";
import { CalendarDays, ChevronLeft, ChevronRight } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PERIODS, periodLabel, periodTimeRange, WEEKDAYS } from "@/shared/constants/period.constant";
import { dayjs, formatShortDate, weekdayOf } from "@/shared/libs/date.lib";
import type { ScheduleEvent } from "../schedule.type";

type WeekScheduleProps = {
  events: ScheduleEvent[];
  termStart: string;
  termEnd: string;
};

function startOfWeek(value: Dayjs) {
  return value.startOf("day").subtract(weekdayOf(value) - 2, "day");
}

function EventBlock({ event, compact = false }: { event: ScheduleEvent; compact?: boolean }) {
  const body = (
    <>
      <span className="font-mono text-xs text-muted">{event.code}</span>
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

export function WeekSchedule({ events, termStart, termEnd }: WeekScheduleProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(dayjs()));
  const today = dayjs().startOf("day");
  const isInTerm = !weekStart.add(6, "day").isBefore(termStart) && !weekStart.isAfter(termEnd);
  const visibleEvents = isInTerm ? events : [];
  const days = WEEKDAYS.map((day, index) => ({ ...day, date: weekStart.add(index, "day") }));
  const isCurrentWeek = weekStart.isSame(startOfWeek(dayjs()), "day");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-label="Tuần trước" icon={<ChevronLeft size={16} aria-hidden />} onClick={() => setWeekStart(weekStart.subtract(1, "week"))} />
        <Button aria-label="Tuần sau" icon={<ChevronRight size={16} aria-hidden />} onClick={() => setWeekStart(weekStart.add(1, "week"))} />
        <Button disabled={isCurrentWeek} onClick={() => setWeekStart(startOfWeek(dayjs()))}>
          Tuần này
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {formatShortDate(weekStart)} - {weekStart.add(6, "day").format("DD/MM/YYYY")}
        </span>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-border-strong bg-surface">
          <EmptyState
            icon={CalendarDays}
            title="Tuần này không có buổi dạy"
            description={isInTerm ? "Chưa có lớp học phần nào xếp lịch trong tuần." : "Tuần đang xem nằm ngoài thời gian học kỳ."}
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-strong bg-surface md:block">
            <div
              className="grid min-w-[880px]"
              style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))", gridTemplateRows: `auto repeat(${PERIODS.length}, 44px)` }}
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
              {PERIODS.map((period, index) => (
                <div
                  key={period.period}
                  style={{ gridColumn: 1, gridRow: index + 2 }}
                  className="flex flex-col justify-center border-b border-border px-2 text-xs text-muted tabular-nums"
                >
                  <span className="font-medium text-foreground">Tiết {period.period}</span>
                  <span>{period.start}</span>
                </div>
              ))}
              {days.map((day, dayIndex) =>
                PERIODS.map((period, index) => (
                  <div
                    key={`${day.value}-${period.period}`}
                    style={{ gridColumn: dayIndex + 2, gridRow: index + 2 }}
                    className={`border-b border-l border-border ${day.date.isSame(today, "day") ? "bg-primary-light" : ""}`}
                  />
                )),
              )}
              {visibleEvents.map((event) => {
                const dayIndex = WEEKDAYS.findIndex((day) => day.value === event.dayOfWeek);
                return (
                  <div
                    key={event.id}
                    style={{ gridColumn: dayIndex + 2, gridRow: `${event.startPeriod + 1} / ${event.endPeriod + 2}` }}
                    className="z-10 p-1"
                  >
                    <EventBlock event={event} />
                  </div>
                );
              })}
            </div>
          </div>

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
