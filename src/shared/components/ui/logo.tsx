import Image from "next/image";
import Link from "next/link";

type LogoProps = {
  href?: string;
  subtitle?: string;
  className?: string;
};

export function Logo({ href = "/", subtitle, className }: LogoProps) {
  return (
    <Link href={href} className={`flex min-w-0 items-center gap-3 ${className ?? ""}`}>
      <Image
        src="/hcmue-logo.png"
        alt="Trường Đại học Sư phạm TP.HCM"
        width={2994}
        height={1512}
        priority
        className="h-9 w-auto shrink-0"
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-primary">HCMUE Portal</span>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
