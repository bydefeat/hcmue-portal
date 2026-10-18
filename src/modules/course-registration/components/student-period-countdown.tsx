"use client";

import { useEffect, useState } from "react";
import { dayjs, formatDateTime } from "@/shared/libs/date.lib";

function remaining(target: string, now: number) {
  const minutes = Math.max(0, dayjs(target).diff(now, "minute"));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${rest} phút`;
  return `${rest} phút`;
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}

export function PeriodCountdown({ target, prefix }: { target: string; prefix: string }) {
  const now = useNow();
  return (
    <span className="tabular-nums">
      {now === null ? `${prefix} lúc ${formatDateTime(target)}` : `${prefix} sau ${remaining(target, now)}`}
    </span>
  );
}
