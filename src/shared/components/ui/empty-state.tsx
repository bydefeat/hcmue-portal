import type { ComponentType } from "react";
import { Empty } from "antd";
import { Inbox, type IconProps } from "defeat-icons-react";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  icon?: ComponentType<IconProps>;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <Empty
      image={<Icon size={28} aria-hidden className="text-muted" />}
      classNames={{ root: "px-4 py-8", image: "h-auto" }}
      description={
        <span className="flex flex-col items-center gap-1">
          <span className="text-base font-medium text-foreground">{title}</span>
          {description && <span className="max-w-sm text-sm text-pretty text-muted">{description}</span>}
        </span>
      }
    >
      {action}
    </Empty>
  );
}
