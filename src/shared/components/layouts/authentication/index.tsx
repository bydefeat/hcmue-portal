import Image from "next/image";
import Link from "next/link";

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="relative hidden min-w-0 flex-1 lg:block">
        <Image
          src="/images/hcmue-campus.jpg"
          alt="Toà nhà chính Trường Đại học Sư phạm Thành phố Hồ Chí Minh"
          fill
          priority
          sizes="(min-width: 1024px) 66vw, 0px"
          className="object-cover"
        />
      </div>
      <main className="flex w-full shrink-0 flex-col items-center justify-center px-4 py-8 lg:w-[480px] lg:px-6">
        <Link href="/" className="flex flex-col items-center gap-3 text-center text-primary">
          <Image
            src="/hcmue-logo.png"
            alt="Logo Trường Đại học Sư phạm TP.HCM"
            width={2994}
            height={1512}
            priority
            className="h-20 w-auto"
          />
          <span className="text-xl leading-snug font-medium uppercase">
            Trường Đại học Sư phạm
            <br />
            Thành phố Hồ Chí Minh
          </span>
          <span className="text-sm font-medium">Cổng đào tạo và học vụ</span>
        </Link>
        <div className="mt-6 w-full max-w-md rounded-xl border border-border-strong bg-surface p-6 sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-muted">© Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
      </main>
    </div>
  );
}
