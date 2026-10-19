"use client";

import { AppProvider } from "@/shared/components/app-provider";
import { ErrorState, errorDigest } from "@/shared/components/ui/error-state";
import { CSS_VARIABLES } from "@/shared/constants/theme.constant";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="vi" className="h-full antialiased" style={CSS_VARIABLES}>
      <body className="min-h-full bg-background font-sans text-sm text-foreground">
        <title>Hệ thống gặp lỗi | HCMUE Portal</title>
        <AppProvider>
          <main className="flex min-h-dvh items-center justify-center p-4">
            <div className="w-full max-w-lg">
              <ErrorState
                title="Hệ thống gặp lỗi"
                description="Cổng chưa tải được. Thử lại sau ít phút, nếu vẫn lỗi hãy báo Phòng Đào tạo kèm mã lỗi bên dưới."
                code={errorDigest(error)}
                onRetry={retry}
                homeHref="/"
                homeLabel="Về trang chủ"
              />
            </div>
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
