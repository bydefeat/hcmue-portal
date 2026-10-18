import { PERIODS, WEEKDAYS } from "@/shared/constants/period.constant";

export type RoomBooking = {
  code: string;
  courseName: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
};

const DAYS = WEEKDAYS.slice(0, 6);

export function RoomWeekGrid({ bookings }: { bookings: RoomBooking[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-120 border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-14 border-b border-border-strong pb-1 text-left font-medium text-muted">Tiết</th>
            {DAYS.map((day) => (
              <th key={day.value} className="border-b border-border-strong pb-1 font-medium text-muted">
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period.period}>
              <td className="border-b border-border py-1 text-muted tabular-nums">{period.period}</td>
              {DAYS.map((day) => {
                const booking = bookings.find((entry) => entry.dayOfWeek === day.value && entry.startPeriod <= period.period && entry.endPeriod >= period.period);
                const isStart = booking?.startPeriod === period.period;
                return (
                  <td key={day.value} className={`border-b border-l border-border px-1 py-1 ${booking ? "bg-primary-light" : ""}`}>
                    {booking && isStart && (
                      <span title={booking.courseName} className="block truncate font-mono text-primary">
                        {booking.code}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
