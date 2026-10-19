import Link from "next/link";
import { Card, Statistic } from "antd";
import { STATUS_TONE_TEXT, type StatusTone } from "@/shared/constants/status.constant";

type StatTileProps = {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  tone?: StatusTone;
  href?: string;
};

export function StatTile({ label, value, hint, tone, href }: StatTileProps) {
  const card = (
    <Card size="small" className={`h-full min-w-0 ${href ? "cursor-pointer transition-colors hover:bg-surface-hover" : ""}`}>
      <Statistic title={label} value={value} groupSeparator="." decimalSeparator="," classNames={{ content: "tabular-nums" }} />
      {hint && <p className={`mt-1 text-xs text-pretty ${tone ? STATUS_TONE_TEXT[tone] : "text-muted"}`}>{hint}</p>}
    </Card>
  );
  if (!href) return card;
  return (
    <Link href={href} className="block h-full text-foreground">
      {card}
    </Link>
  );
}
