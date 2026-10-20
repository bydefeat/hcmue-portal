"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb, Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { MobileNavigation } from "@/shared/components/ui/mobile-navigation";
import { NotificationBell, type BellItem, type MarkNotificationsRead } from "@/shared/components/ui/notification-bell";
import { UserMenu, type MenuUser, type RoleSwitcher } from "@/shared/components/ui/user-menu";
import {
  ADMINISTRATOR_ACCOUNT_LINKS,
  ADMINISTRATOR_BOTTOM_TABS,
  ADMINISTRATOR_HOME_HREF,
  ADMINISTRATOR_NAVIGATION,
  ADMINISTRATOR_NOTIFICATIONS_HREF,
  filterNavigation,
  isActiveItem,
  type NavGroup,
} from "@/shared/constants/navigation.constant";
import { GlobalSearch, type SearchEntry } from "@/shared/components/layouts/administrator/global-search";
import { AdministratorSidebar } from "@/shared/components/layouts/administrator/sidebar";

export type { SearchEntry };

type AdministratorLayoutProps = {
  user: MenuUser;
  termLabel: string;
  permissions: string[];
  searchEntries: SearchEntry[];
  notifications: BellItem[];
  unreadNotifications?: number;
  onMarkNotificationsRead?: MarkNotificationsRead;
  switcher?: RoleSwitcher;
  children: React.ReactNode;
};

const ACCOUNT_GROUP: Pick<NavGroup, "label" | "items"> = {
  label: "Tài khoản",
  items: [...ADMINISTRATOR_ACCOUNT_LINKS, { label: "Thông báo", href: ADMINISTRATOR_NOTIFICATIONS_HREF }],
};

function breadcrumbItems(navigation: Pick<NavGroup, "label" | "items">[], pathname: string) {
  const groups = [...navigation, ACCOUNT_GROUP];
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

export function AdministratorLayout({
  user,
  termLabel,
  permissions,
  searchEntries,
  notifications,
  unreadNotifications,
  onMarkNotificationsRead,
  switcher,
  children,
}: AdministratorLayoutProps) {
  const pathname = usePathname();
  const groups = filterNavigation(ADMINISTRATOR_NAVIGATION, permissions);
  const navItems = groups.flatMap((group) => group.items);
  const dockItems = navItems.filter((item) => ADMINISTRATOR_BOTTOM_TABS.includes(item.href));
  const mobileSections = [
    ...groups.map((group) => ({ title: group.label, items: group.items })),
    { title: "Tài khoản", items: ADMINISTRATOR_ACCOUNT_LINKS },
  ];

  return (
    <Layout hasSider className="min-h-dvh">
      <AdministratorSidebar user={user} groups={groups} switcher={switcher} />
      <Layout className="min-w-0">
        <Layout.Header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border-strong px-4 sm:px-6 print:!hidden">
          <Logo href={ADMINISTRATOR_HOME_HREF} className="shrink-0 lg:hidden" />
          <Breadcrumb items={breadcrumbItems(groups, pathname)} className="hidden min-w-0 shrink lg:block" />
          <div className="hidden min-w-0 flex-1 justify-end leading-normal md:flex">
            <GlobalSearch entries={searchEntries} />
          </div>
          <span className="hidden shrink-0 text-sm text-muted 2xl:block">{termLabel}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1 leading-normal md:ml-0">
            <NotificationBell items={notifications} unreadCount={unreadNotifications} viewAllHref={ADMINISTRATOR_NOTIFICATIONS_HREF} onMarkRead={onMarkNotificationsRead} />
            <div className="lg:hidden">
              <UserMenu user={user} links={ADMINISTRATOR_ACCOUNT_LINKS} switcher={switcher} compact />
            </div>
          </div>
        </Layout.Header>
        <Layout.Content className="min-w-0 p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
          <div className="mb-4 md:hidden print:hidden">
            <GlobalSearch entries={searchEntries} />
          </div>
          {children}
        </Layout.Content>
      </Layout>
      <MobileNavigation dockItems={dockItems} sections={mobileSections} homeHref={ADMINISTRATOR_HOME_HREF} hideFrom="lg" />
    </Layout>
  );
}
