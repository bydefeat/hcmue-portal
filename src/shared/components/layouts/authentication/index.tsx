import Image from "next/image";
import Link from "next/link";

export function AuthenticationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="hidden w-[44%] max-w-2xl shrink-0 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <Link href="/" className="w-fit">
          <Image
            src="/hcmue-logo.png"
            alt="Trường Đại học Sư phạm TP.HCM"
            width={2994}
            height={1512}
            priority
            className="h-14 w-auto"
          />
        </Link>
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-sm font-medium tracking-wide text-primary-foreground/70 uppercase">HCMUE Portal</p>
          <p className="text-3xl font-semibold text-balance">Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
          <p className="text-base text-pretty text-primary-foreground/80">
            Cổng đào tạo và học vụ: đăng ký học phần, thời khóa biểu, kết quả học tập.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-sm text-primary-foreground/70">
          <p>280 An Dương Vương, Thành phố Hồ Chí Minh</p>
          <a
            href="https://hcmue.edu.vn"
            target="_blank"
            rel="noreferrer"
            className="w-fit transition-colors hover:text-primary-foreground hover:underline"
          >
            hcmue.edu.vn
          </a>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
