import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AntdRegistry } from "@/shared/components/antd-registry";
import { AppProvider } from "@/shared/components/app-provider";
import { CSS_VARIABLES } from "@/shared/constants/theme.constant";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: {
    default: "HCMUE Portal - Cổng Đào tạo & Học vụ ĐH Sư phạm TP.HCM",
    template: "%s | HCMUE Portal",
  },
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
      className={`${geistSans.variable} h-full antialiased`}
      style={CSS_VARIABLES}
    >
      <body className="min-h-full bg-background font-sans text-sm text-foreground">
        <AntdRegistry>
          <AppProvider>{children}</AppProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
