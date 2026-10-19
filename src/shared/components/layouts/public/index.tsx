"use client";

import { Layout } from "antd";
import { MobileNavigation } from "@/shared/components/ui/mobile-navigation";
import { PUBLIC_NAVIGATION, PUBLIC_SIGN_IN_HREF } from "@/shared/constants/navigation.constant";
import { PublicFooter } from "@/shared/components/layouts/public/footer";
import { PublicHeader } from "@/shared/components/layouts/public/header";

const MOBILE_SECTIONS = [{ items: PUBLIC_NAVIGATION }];
const SIGN_IN_ACTION = { label: "Đăng nhập", href: PUBLIC_SIGN_IN_HREF };

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout className="min-h-dvh">
      <PublicHeader />
      <Layout.Content className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</Layout.Content>
      <PublicFooter />
      <MobileNavigation
        dockItems={PUBLIC_NAVIGATION}
        sections={MOBILE_SECTIONS}
        homeHref="/"
        hideFrom="md"
        action={SIGN_IN_ACTION}
      />
    </Layout>
  );
}
