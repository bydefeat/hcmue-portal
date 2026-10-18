import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AntdProvider } from "@/shared/components/antd-provider";
import { CSS_VARIABLES } from "@/shared/constants/theme.constant";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HCMUE Portal - Cổng Đào tạo & Học vụ ĐH Sư phạm TP.HCM",
  description: "Hệ thống quản lý đăng ký học phần và kết quả học tập sinh viên - Trường Đại học Sư phạm TP.HCM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={CSS_VARIABLES}
    >
      <body className="min-h-full bg-background font-sans text-sm text-foreground">
        <Suspense fallback={null}>
          <AntdRegistry layer>
            <AntdProvider>{children}</AntdProvider>
          </AntdRegistry>
        </Suspense>
      </body>
    </html>
  );
}
