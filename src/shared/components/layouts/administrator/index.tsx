"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb, Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { MobileNavigation } from "@/shared/components/ui/mobile-navigation";
import { UserMenu, type MenuUser } from "@/shared/components/ui/user-menu";
import {
  ADMINISTRATOR_BOTTOM_TABS,
  ADMINISTRATOR_HOME_HREF,
  ADMINISTRATOR_NAVIGATION,
  isActiveItem,
} from "@/shared/constants/navigation.constant";
import { GlobalSearch, type SearchEntry } from "./global-search";
import { AdministratorSidebar } from "./sidebar";

export type { SearchEntry };

type AdministratorLayoutProps = {
  user: MenuUser;
  termLabel: string;
  searchEntries: SearchEntry[];
  children: React.ReactNode;
};

const NAV_ITEMS = ADMINISTRATOR_NAVIGATION.flatMap((group) => group.items);
const DOCK_ITEMS = NAV_ITEMS.filter((item) => ADMINISTRATOR_BOTTOM_TABS.includes(item.href));
const MOBILE_SECTIONS = ADMINISTRATOR_NAVIGATION.map((group) => ({ title: group.label, items: group.items }));

function breadcrumbItems(pathname: string) {
  const group = ADMINISTRATOR_NAVIGATION.find((entry) => entry.items.some((item) => isActiveItem(pathname, item)));
  const item = group?.items.find((entry) => isActiveItem(pathname, entry));
  if (!group || !item) return [];
  const isDetail = pathname !== item.href;
  return [
    { title: group.label },
    { title: isDetail ? <Link href={item.href}>{item.label}</Link> : item.label },
    ...(isDetail ? [{ title: "Chi tiết" }] : []),
  ];
}

export function AdministratorLayout({ user, termLabel, searchEntries, children }: AdministratorLayoutProps) {
  const pathname = usePathname();
  const breadcrumb = breadcrumbItems(pathname);

  return (
    <Layout hasSider className="min-h-dvh">
      <AdministratorSidebar user={user} />
      <Layout className="min-w-0">
        <Layout.Header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border-strong px-4 sm:px-6">
          <Logo href={ADMINISTRATOR_HOME_HREF} className="shrink-0 lg:hidden" />
          <Breadcrumb items={breadcrumb} className="hidden min-w-0 shrink lg:block" />
          <div className="hidden min-w-0 flex-1 justify-end leading-normal md:flex">
            <GlobalSearch entries={searchEntries} />
          </div>
          <span className="hidden shrink-0 text-sm text-muted xl:block">{termLabel}</span>
          <div className="ml-auto shrink-0 md:ml-0 lg:hidden">
            <UserMenu user={user} compact />
          </div>
        </Layout.Header>
        <Layout.Content className="min-w-0 p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
          <div className="mb-4 md:hidden">
            <GlobalSearch entries={searchEntries} />
          </div>
          {children}
        </Layout.Content>
      </Layout>
      <MobileNavigation dockItems={DOCK_ITEMS} sections={MOBILE_SECTIONS} homeHref={ADMINISTRATOR_HOME_HREF} hideFrom="lg" />
    </Layout>
  );
}
