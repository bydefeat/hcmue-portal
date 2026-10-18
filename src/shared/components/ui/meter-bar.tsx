import { STATUS_TONE_BAR, type StatusTone } from "@/shared/constants/status.constant";

type MeterBarProps = {
  value: number;
  max: number;
  tone?: StatusTone | "primary";
  label?: string;
};

export function MeterBar({ value, max, tone = "primary", label }: MeterBarProps) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barClass = tone === "primary" ? "bg-primary" : STATUS_TONE_BAR[tone];

  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-border-strong"
    >
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
