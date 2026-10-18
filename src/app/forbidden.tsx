import type { Metadata } from "next";
import Link from "next/link";
import { ShieldLock } from "defeat-icons-react";

export const metadata: Metadata = { title: "Không có quyền truy cập" };

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border-strong bg-surface p-6 text-center sm:p-8">
        <ShieldLock size={32} aria-hidden className="text-muted" />
        <h1 className="text-xl font-semibold">Bạn chưa được cấp quyền xem trang này</h1>
        <p className="text-sm text-pretty text-muted">
          Vai trò hiện tại của tài khoản không gồm quyền cần cho chức năng này. Liên hệ quản trị hệ thống của Phòng Đào tạo để được cấp quyền.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/administrator" className="text-sm">
            Về trang tổng quan
          </Link>
        </div>
      </div>
    </main>
  );
}
