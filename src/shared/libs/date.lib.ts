import dayjs, { type ConfigType } from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/vi";

dayjs.extend(relativeTime);
dayjs.locale("vi");

export function formatDate(value: ConfigType) {
  return dayjs(value).format("DD/MM/YYYY");
}

export function formatDateTime(value: ConfigType) {
  return dayjs(value).format("HH:mm, DD/MM/YYYY");
}

export function formatShortDate(value: ConfigType) {
  return dayjs(value).format("DD/MM");
}

export function formatRelative(value: ConfigType) {
  return dayjs(value).fromNow();
}

export function hoursUntil(value: ConfigType) {
  return dayjs(value).diff(dayjs(), "hour", true);
}

export function daysUntil(value: ConfigType) {
  return dayjs(value).startOf("day").diff(dayjs().startOf("day"), "day");
}

export function weekdayOf(value: ConfigType) {
  const day = dayjs(value).day();
  return day === 0 ? 8 : day + 1;
}

export { dayjs };
