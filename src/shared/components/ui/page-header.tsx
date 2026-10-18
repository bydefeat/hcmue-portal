import Link from "next/link";
import { ChevronLeft } from "defeat-icons-react";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
};

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link
            href={back.href}
            className="flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft size={14} aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="min-w-0 text-xl font-semibold text-pretty">{title}</h1>
        {description && <p className="max-w-prose text-sm text-pretty text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
