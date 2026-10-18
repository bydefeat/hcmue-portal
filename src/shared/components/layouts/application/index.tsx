"use client";

import { usePathname } from "next/navigation";
import { Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import {
  APPLICATION_NAVIGATION,
  APPLICATION_PROFILE,
  isActiveHref,
} from "@/shared/constants/navigation.constant";
import { ApplicationSidebar } from "./sidebar";
import { BottomTabs } from "./bottom-tabs";
import { UserMenu, type ApplicationUser } from "./user-menu";

type ApplicationLayoutProps = {
  user: ApplicationUser;
  termLabel: string;
  children: React.ReactNode;
};

const ALL_ITEMS = [...APPLICATION_NAVIGATION.flatMap((group) => group.items), APPLICATION_PROFILE];

export function ApplicationLayout({ user, termLabel, children }: ApplicationLayoutProps) {
  const pathname = usePathname();
  const title = ALL_ITEMS.find((item) => isActiveHref(pathname, item.href))?.label;

  return (
    <Layout className="min-h-dvh">
      <ApplicationSidebar user={user} />
      <Layout>
        <Layout.Header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 sm:px-6">
          <Logo href="/application/dashboard" className="lg:hidden" />
          {/* Trang không có đầu trang riêng: tên trên thanh header chính là <h1>. */}
          <h1 className="hidden min-w-0 truncate text-base font-semibold lg:block">{title}</h1>
          <span className="ml-auto hidden shrink-0 text-sm text-muted sm:block">{termLabel}</span>
          <div className="ml-auto sm:ml-0 lg:hidden">
            <UserMenu user={user} compact />
          </div>
        </Layout.Header>
        {/* pb-24: chừa chỗ cho thanh tab dưới trên điện thoại. */}
        <Layout.Content className="p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
          <h1 className="mb-4 text-xl font-semibold lg:hidden">{title}</h1>
          {children}
        </Layout.Content>
      </Layout>
      <BottomTabs />
    </Layout>
  );
}
