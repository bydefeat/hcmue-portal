import { Logo } from "@/shared/components/ui/logo";

type AuthHeadingProps = {
  title: string;
  description?: React.ReactNode;
};

export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <Logo className="mb-6 lg:hidden" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="text-sm text-pretty text-muted">{description}</p>}
    </div>
  );
}
