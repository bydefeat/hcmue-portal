import { PERIODS } from "@/shared/constants/period.constant";
import { dayjs } from "@/shared/libs/date.lib";
import type { ScheduleSession } from "@/modules/schedule/schedule.type";

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function localStamp(date: string, time: string) {
  return `${dayjs(date).format("YYYYMMDD")}T${time.replace(":", "")}00`;
}

function fold(line: string) {
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 73) chunks.push((index === 0 ? "" : " ") + line.slice(index, index + 73));
  return chunks.join("\r\n");
}

// Mỗi buổi học thật là một sự kiện (không dùng RRULE theo tuần): ngày nghỉ lễ đã bị trừ, buổi đổi lịch đúng ngày mới.
export function buildIcs(params: { calendarName: string; sessions: ScheduleSession[]; generatedAt: string }) {
  const stamp = dayjs(params.generatedAt).format("YYYYMMDD[T]HHmmss");
  const body = params.sessions.flatMap((session) => {
    const start = PERIODS.find((period) => period.period === session.startPeriod)?.start ?? "06:30";
    const end = PERIODS.find((period) => period.period === session.endPeriod)?.end ?? "07:20";
    return [
      "BEGIN:VEVENT",
      `UID:${session.id}@portal.hcmue.edu.vn`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Ho_Chi_Minh:${localStamp(session.date, start)}`,
      `DTEND;TZID=Asia/Ho_Chi_Minh:${localStamp(session.date, end)}`,
      `SUMMARY:${escapeText(`${session.title} (${session.code})`)}`,
      `LOCATION:${escapeText(session.room)}`,
      `DESCRIPTION:${escapeText(`Tiết ${session.startPeriod}-${session.endPeriod}`)}`,
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
