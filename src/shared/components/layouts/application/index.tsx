"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb, Layout } from "antd";
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
const ACCOUNT_GROUP = { label: "Tài khoản", items: [APPLICATION_PROFILE, { label: "Thông báo", href: APPLICATION_NOTIFICATIONS_HREF }] };
const DOCK_ITEMS = NAV_ITEMS.filter((item) => APPLICATION_BOTTOM_TABS.includes(item.href));
const MOBILE_SECTIONS = [
  ...APPLICATION_NAVIGATION.map((group) => ({ title: group.label, items: group.items })),
  { title: "Tài khoản", items: [APPLICATION_PROFILE] },
];

function breadcrumbItems(pathname: string) {
  const groups = [...APPLICATION_NAVIGATION, ACCOUNT_GROUP];
  const group = groups.find((entry) => entry.items.some((item) => isActiveItem(pathname, item)));
  const item = group?.items.find((entry) => isActiveItem(pathname, entry));
  if (!group || !item) return [];
  const isDetail = pathname !== item.href;
  return [
    { title: group.label },
    { title: isDetail ? <Link href={item.href}>{item.label}</Link> : item.label },
    ...(isDetail ? [{ title: "Chi tiết" }] : []),
  ];
}

export function ApplicationLayout({ user, termLabel, notifications, children }: ApplicationLayoutProps) {
  const pathname = usePathname();
  const breadcrumb = breadcrumbItems(pathname);

  return (
    <Layout hasSider className="min-h-dvh">
      <ApplicationSidebar user={user} />
      <Layout>
        <Layout.Header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-strong px-4 sm:px-6 print:!hidden">
          <Logo href="/application/dashboard" className="lg:hidden" />
          <Breadcrumb items={breadcrumb} className="hidden min-w-0 lg:block" />
          <span className="ml-auto hidden shrink-0 text-sm text-muted sm:block">{termLabel}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 leading-normal sm:ml-0">
            <NotificationBell items={notifications} viewAllHref={APPLICATION_NOTIFICATIONS_HREF} />
            <div className="lg:hidden">
              <UserMenu user={user} links={[APPLICATION_PROFILE]} compact />
            </div>
          </div>
        </Layout.Header>
        <Layout.Content className="p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
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
