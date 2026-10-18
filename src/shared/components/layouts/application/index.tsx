"use client";

import { usePathname } from "next/navigation";
import { Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { MobileNavigation } from "@/shared/components/ui/mobile-navigation";
import {
  APPLICATION_BOTTOM_TABS,
  APPLICATION_NAVIGATION,
  APPLICATION_NOTIFICATIONS_HREF,
  APPLICATION_PROFILE,
  isActiveItem,
} from "@/shared/constants/navigation.constant";
import { NotificationBell, type BellItem } from "@/shared/components/ui/notification-bell";
import { UserMenu, type MenuUser } from "@/shared/components/ui/user-menu";
import { ApplicationSidebar } from "./sidebar";

type ApplicationLayoutProps = {
  user: MenuUser;
  termLabel: string;
  notifications: BellItem[];
  children: React.ReactNode;
};

const NAV_ITEMS = APPLICATION_NAVIGATION.flatMap((group) => group.items);
const ALL_ITEMS = [...NAV_ITEMS, APPLICATION_PROFILE];
const DOCK_ITEMS = NAV_ITEMS.filter((item) => APPLICATION_BOTTOM_TABS.includes(item.href));
const MOBILE_SECTIONS = [
  ...APPLICATION_NAVIGATION.map((group) => ({ title: group.label, items: group.items })),
  { title: "Tài khoản", items: [APPLICATION_PROFILE] },
];

export function ApplicationLayout({ user, termLabel, notifications, children }: ApplicationLayoutProps) {
  const pathname = usePathname();
  const title = ALL_ITEMS.find((item) => isActiveItem(pathname, item))?.label;

  return (
    <Layout hasSider className="min-h-dvh">
      <ApplicationSidebar user={user} />
      <Layout>
        <Layout.Header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-strong px-4 sm:px-6">
          <Logo href="/application/dashboard" className="lg:hidden" />
          <h1 className="hidden min-w-0 truncate text-base font-semibold lg:block">{title}</h1>
          <span className="ml-auto hidden shrink-0 text-sm text-muted sm:block">{termLabel}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 leading-normal sm:ml-0">
            <NotificationBell items={notifications} viewAllHref={APPLICATION_NOTIFICATIONS_HREF} />
            <div className="lg:hidden">
              <UserMenu user={user} links={[APPLICATION_PROFILE]} compact />
            </div>
          </div>
        </Layout.Header>
        <Layout.Content className="p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
          <h1 className="mb-4 text-xl font-semibold lg:hidden">{title}</h1>
          {children}
        </Layout.Content>
      </Layout>
      <MobileNavigation
        dockItems={DOCK_ITEMS}
        sections={MOBILE_SECTIONS}
        homeHref="/application/dashboard"
        hideFrom="lg"
      />
    </Layout>
  );
}
