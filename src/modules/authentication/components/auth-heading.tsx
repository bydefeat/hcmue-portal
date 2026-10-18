type AuthHeadingProps = {
  title: string;
  description?: React.ReactNode;
};

export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-brand-accent uppercase">{title}</h1>
      {description && <p className="text-sm text-pretty text-muted">{description}</p>}
    </div>
  );
}
