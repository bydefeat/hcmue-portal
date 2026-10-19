export const PERIODS = [
  { period: 1, start: "06:30", end: "07:20" },
  { period: 2, start: "07:20", end: "08:10" },
  { period: 3, start: "08:10", end: "09:00" },
  { period: 4, start: "09:10", end: "10:00" },
  { period: 5, start: "10:00", end: "10:50" },
  { period: 6, start: "10:50", end: "11:40" },
  { period: 7, start: "12:30", end: "13:20" },
  { period: 8, start: "13:20", end: "14:10" },
  { period: 9, start: "14:10", end: "15:00" },
  { period: 10, start: "15:10", end: "16:00" },
  { period: 11, start: "16:00", end: "16:50" },
  { period: 12, start: "16:50", end: "17:40" },
] as const;

export const BREAKS = [
  { afterPeriod: 3, label: "Giải lao", start: "09:00", end: "09:10" },
  { afterPeriod: 6, label: "Nghỉ trưa", start: "11:40", end: "12:30" },
  { afterPeriod: 9, label: "Giải lao", start: "15:00", end: "15:10" },
] as const;

export const WEEKDAYS = [
  { value: 2, label: "Thứ 2", short: "T2" },
  { value: 3, label: "Thứ 3", short: "T3" },
  { value: 4, label: "Thứ 4", short: "T4" },
  { value: 5, label: "Thứ 5", short: "T5" },
  { value: 6, label: "Thứ 6", short: "T6" },
  { value: 7, label: "Thứ 7", short: "T7" },
  { value: 8, label: "Chủ nhật", short: "CN" },
] as const;

export function weekdayLabel(value: number) {
  return WEEKDAYS.find((day) => day.value === value)?.label ?? "";
}

export function periodTimeRange(startPeriod: number, endPeriod: number) {
  const start = PERIODS.find((item) => item.period === startPeriod)?.start ?? "";
  const end = PERIODS.find((item) => item.period === endPeriod)?.end ?? "";
  return `${start} - ${end}`;
}

export function periodLabel(startPeriod: number, endPeriod: number) {
  return startPeriod === endPeriod ? `Tiết ${startPeriod}` : `Tiết ${startPeriod}-${endPeriod}`;
}
