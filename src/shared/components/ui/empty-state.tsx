import { Empty } from "antd";
import { Illustration, type IllustrationName } from "./illustration";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  illustration?: IllustrationName;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, illustration = "inbox", action }: EmptyStateProps) {
  return (
    <Empty
      image={<Illustration name={illustration} className="mx-auto w-36 sm:w-40" />}
      classNames={{ root: "px-4 py-8", image: "h-auto mb-3" }}
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
