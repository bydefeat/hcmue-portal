import Link from "next/link";
import { STATUS_TONE_TEXT, type StatusTone } from "@/shared/constants/status.constant";

type StatTileProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatusTone;
  href?: string;
};

export function StatTile({ label, value, hint, tone, href }: StatTileProps) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className={`text-xs text-pretty ${tone ? STATUS_TONE_TEXT[tone] : "text-muted"}`}>{hint}</span>}
    </>
  );
  const className = "flex min-w-0 flex-col gap-1 rounded-xl border border-border-strong bg-surface p-4 sm:p-5";

  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={`${className} cursor-pointer text-foreground transition-colors hover:bg-surface-hover`}>
      {body}
    </Link>
  );
}
