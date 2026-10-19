import { PERIODS } from "@/shared/constants/period.constant";
import { dayjs, weekdayOf } from "@/shared/libs/date.lib";
import type { ScheduleEvent } from "./schedule.type";

const ICS_DAY = ["", "", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function localStamp(date: string, time: string) {
  return `${dayjs(date).format("YYYYMMDD")}T${time.replace(":", "")}00`;
}

function firstOccurrence(termStart: string, dayOfWeek: number) {
  let date = dayjs(termStart).startOf("day");
  while (weekdayOf(date) !== dayOfWeek) date = date.add(1, "day");
  return date.format("YYYY-MM-DD");
}

function fold(line: string) {
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 73) chunks.push((index === 0 ? "" : " ") + line.slice(index, index + 73));
  return chunks.join("\r\n");
}

export function buildIcs(params: { calendarName: string; events: ScheduleEvent[]; termStart: string; termEnd: string; generatedAt: string }) {
  const until = `${dayjs(params.termEnd).format("YYYYMMDD")}T235959`;
  const stamp = dayjs(params.generatedAt).format("YYYYMMDD[T]HHmmss");
  const body = params.events.flatMap((event) => {
    const start = PERIODS.find((period) => period.period === event.startPeriod)?.start ?? "06:30";
    const end = PERIODS.find((period) => period.period === event.endPeriod)?.end ?? "07:20";
    const date = firstOccurrence(params.termStart, event.dayOfWeek);
    return [
      "BEGIN:VEVENT",
      `UID:${event.id}@portal.hcmue.edu.vn`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${localStamp(date, start)}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${localStamp(date, end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY[event.dayOfWeek]};UNTIL=${until}`,
      `SUMMARY:${escapeText(`${event.title} (${event.code})`)}`,
      `LOCATION:${escapeText(event.room)}`,
      `DESCRIPTION:${escapeText(`Tiết ${event.startPeriod}-${event.endPeriod}`)}`,
      "END:VEVENT",
    ];
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HCMUE//Portal//VI",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(params.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    ...body,
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
}
