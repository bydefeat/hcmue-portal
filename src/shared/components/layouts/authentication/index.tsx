import Image from "next/image";
import Link from "next/link";
import { ConfigProvider } from "antd";

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-background">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[300px] bg-primary sm:h-[360px]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-10 pb-6 sm:pt-14">
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
        <main className="mt-8 rounded-2xl border border-border-strong bg-surface p-6 sm:p-8">
          <ConfigProvider theme={{ token: { controlHeightLG: 48 } }}>{children}</ConfigProvider>
        </main>
        <p className="mt-auto pt-8 text-center text-xs text-muted">© Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
      </div>
    </div>
  );
}
