import dayjs, { type ConfigType } from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/vi";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("vi");

export const SCHOOL_TIMEZONE = "Asia/Ho_Chi_Minh";

// Mọi ngày giờ hiển thị theo giờ Việt Nam, kể cả khi máy người dùng đặt múi giờ khác: server render theo giờ Việt Nam
// (src/instrumentation.ts), trình duyệt render lại phải ra cùng chuỗi để không lỗi hydration.
// Chuỗi không ghi múi giờ ("2026-10-28", "2026-10-28T07:30") là giờ của trường; chuỗi có Z/+07:00 và Date là thời điểm tuyệt đối.
export function schoolTime(value?: ConfigType) {
  if (value === undefined) return dayjs().tz(SCHOOL_TIMEZONE);
  if (typeof value === "string" && !/[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i.test(value)) return dayjs.tz(value, SCHOOL_TIMEZONE);
  return dayjs(value).tz(SCHOOL_TIMEZONE);
}

export function formatDate(value: ConfigType) {
  return schoolTime(value).format("DD/MM/YYYY");
}

export function formatDateTime(value: ConfigType) {
  return schoolTime(value).format("HH:mm, DD/MM/YYYY");
}

export function formatShortDate(value: ConfigType) {
  return schoolTime(value).format("DD/MM");
}

export function formatRelative(value: ConfigType) {
  return dayjs(value).fromNow();
}

export function hoursUntil(value: ConfigType) {
  return schoolTime(value).diff(schoolTime(), "hour", true);
}

export function daysUntil(value: ConfigType) {
  return schoolTime(value).startOf("day").diff(schoolTime().startOf("day"), "day");
}

export function currentYear() {
  return schoolTime().year();
}

export function weekdayOf(value?: ConfigType) {
  const day = schoolTime(value).day();
  return day === 0 ? 8 : day + 1;
}

export { dayjs };
