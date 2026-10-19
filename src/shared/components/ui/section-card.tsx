import { Card } from "antd";

type SectionCardProps = {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  flush?: boolean;
  size?: "small" | "medium";
  className?: string;
  children: React.ReactNode;
};

export function SectionCard({ title, extra, flush = false, size, className, children }: SectionCardProps) {
  return (
    <Card title={title} extra={extra} size={size} className={`min-w-0 ${className ?? ""}`} classNames={flush ? { body: "p-0" } : undefined}>
      {children}
    </Card>
  );
}
