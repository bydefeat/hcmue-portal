export const PERIODS = [
  { period: 1, start: "07:00", end: "07:50" },
  { period: 2, start: "07:50", end: "08:40" },
  { period: 3, start: "08:50", end: "09:40" },
  { period: 4, start: "09:40", end: "10:30" },
  { period: 5, start: "10:40", end: "11:30" },
  { period: 6, start: "11:30", end: "12:20" },
  { period: 7, start: "12:45", end: "13:35" },
  { period: 8, start: "13:35", end: "14:25" },
  { period: 9, start: "14:35", end: "15:25" },
  { period: 10, start: "15:25", end: "16:15" },
  { period: 11, start: "16:25", end: "17:15" },
  { period: 12, start: "17:15", end: "18:05" },
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
