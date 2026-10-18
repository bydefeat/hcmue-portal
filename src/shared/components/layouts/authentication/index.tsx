import Image from "next/image";
import Link from "next/link";

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background bg-linear-to-b from-primary from-0% via-primary via-[280px] to-background to-[620px] sm:via-[340px] sm:to-[720px]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-10 pb-6 sm:pt-14">
        <Link href="/" className="flex flex-col items-center gap-3 text-center text-primary-foreground">
          <Image
            src="/hcmue-logo.png"
            alt="Logo Trường Đại học Sư phạm TP.HCM"
            width={2994}
            height={1512}
            priority
            className="h-16 w-auto sm:h-20"
          />
          <span className="text-lg leading-snug font-medium uppercase sm:text-xl">
            Trường Đại học Sư phạm
            <br />
            Thành phố Hồ Chí Minh
          </span>
          <span className="text-sm text-primary-foreground/80">Cổng đào tạo và học vụ</span>
        </Link>
        <main className="mt-8 rounded-2xl border border-border-strong bg-surface p-6 sm:p-8">{children}</main>
        <p className="mt-auto pt-8 text-center text-xs text-muted">© Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
      </div>
    </div>
  );
}
