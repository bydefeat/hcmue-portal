import type { Metadata } from "next";
import Link from "next/link";
import { Card, Result } from "antd";

export const metadata: Metadata = { title: "Không có quyền truy cập" };

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <Result
          status="403"
          title={<h1 className="text-xl font-semibold">Bạn chưa được cấp quyền xem trang này</h1>}
          subTitle="Vai trò hiện tại của tài khoản không gồm quyền cần cho chức năng này. Liên hệ quản trị hệ thống của Phòng Đào tạo để được cấp quyền."
          extra={<Link href="/administrator">Về trang tổng quan</Link>}
        />
      </Card>
    </main>
  );
}
