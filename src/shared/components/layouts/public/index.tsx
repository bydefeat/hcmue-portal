"use client";

import { Layout } from "antd";
import { PublicHeader } from "./header";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout className="min-h-dvh">
      <PublicHeader />
      <Layout.Content className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</Layout.Content>
      <Layout.Footer className="text-primary-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-8 sm:px-6">
          <p className="text-base font-semibold">Trường Đại học Sư phạm Thành phố Hồ Chí Minh</p>
          <p className="text-sm text-primary-foreground/80">280 An Dương Vương, Thành phố Hồ Chí Minh</p>
          <a
            href="https://hcmue.edu.vn"
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-primary-foreground/80 underline-offset-4 transition-colors hover:text-primary-foreground hover:underline"
          >
            hcmue.edu.vn
          </a>
        </div>
      </Layout.Footer>
    </Layout>
  );
}
