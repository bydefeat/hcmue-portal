export type StatusTone = "neutral" | "success" | "warning" | "danger";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
};

export const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  neutral: "default",
  success: "success",
  warning: "warning",
  danger: "error",
};

export const STATUS_TONE_TEXT: Record<StatusTone, string> = {
  neutral: "text-muted",
  success: "text-green-700",
  warning: "text-amber-700",
  danger: "text-rose-700",
};

export const STATUS_TONE_BAR: Record<StatusTone, string> = {
  neutral: "bg-neutral-300",
  success: "bg-green-600",
  warning: "bg-amber-500",
  danger: "bg-rose-600",
};
