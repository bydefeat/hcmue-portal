import Image from "next/image";
import Link from "next/link";

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Image
        src="/images/hcmue-campus.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 scale-105 object-cover blur-sm"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-primary/25" />
      <main className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl sm:p-8">
        <Link href="/" className="mb-8 flex flex-col items-center gap-2 text-center text-primary">
          <Image
            src="/hcmue-logo.png"
            alt="Logo Trường Đại học Sư phạm TP.HCM"
            width={2994}
            height={1512}
            priority
            className="mb-2 h-16 w-auto"
          />
          <span className="text-base leading-snug font-medium uppercase">
            Trường Đại học Sư phạm
            <br />
            Thành phố Hồ Chí Minh
          </span>
          <span className="text-sm">Cổng đào tạo và học vụ</span>
        </Link>
        {children}
      </main>
      <p className="mt-6 text-center text-xs text-white/85">© Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
    </div>
  );
}
