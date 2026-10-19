"use client";

import { Table, type TableColumnsType } from "antd";
import { PERIODS, WEEKDAYS } from "@/shared/constants/period.constant";

export type RoomBooking = {
  code: string;
  courseName: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
};

type PeriodRow = (typeof PERIODS)[number];

const DAYS = WEEKDAYS.slice(0, 6);

export function RoomWeekGrid({ bookings }: { bookings: RoomBooking[] }) {
  const bookingAt = (day: number, period: number) =>
    bookings.find((entry) => entry.dayOfWeek === day && entry.startPeriod <= period && entry.endPeriod >= period);

  const columns: TableColumnsType<PeriodRow> = [
    { title: "Tiết", dataIndex: "period", width: 56, render: (period: number) => <span className="text-muted tabular-nums">{period}</span> },
    ...DAYS.map((day) => ({
      title: day.short,
      key: day.value,
      align: "center" as const,
      onCell: (row: PeriodRow) => ({ className: bookingAt(day.value, row.period) ? "bg-primary-light" : undefined }),
      render: (_: unknown, row: PeriodRow) => {
        const booking = bookingAt(day.value, row.period);
        return booking && booking.startPeriod === row.period ? (
          <span title={booking.courseName} className="block truncate text-xs text-primary">
            {booking.code}
          </span>
        ) : null;
      },
    })),
  ];

  return <Table rowKey="period" size="small" bordered pagination={false} dataSource={PERIODS} columns={columns} scroll={{ x: 480 }} />;
}
