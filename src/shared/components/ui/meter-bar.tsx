"use client";

import { Progress, theme } from "antd";
import type { StatusTone } from "@/shared/constants/status.constant";

type MeterBarProps = {
  value: number;
  max: number;
  tone?: StatusTone | "primary";
  label?: string;
};

export function MeterBar({ value, max, tone = "primary", label }: MeterBarProps) {
  const { token } = theme.useToken();
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = {
    primary: token.colorPrimary,
    success: token.colorSuccess,
    warning: token.colorWarning,
    danger: token.colorError,
    neutral: token.colorTextQuaternary,
  }[tone];

  return <Progress percent={percent} showInfo={false} size="small" strokeColor={color} aria-label={label} className="m-0 w-full min-w-12" />;
}
