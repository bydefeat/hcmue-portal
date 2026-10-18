import type { ComponentType } from "react";
import { Inbox, type IconProps } from "defeat-icons-react";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  icon?: ComponentType<IconProps>;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon size={28} aria-hidden className="text-muted" />
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-pretty text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
