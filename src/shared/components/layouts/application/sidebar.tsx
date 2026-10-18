"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu, type MenuProps } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { APPLICATION_NAVIGATION, isActiveHref, type NavItem } from "@/shared/constants/navigation.constant";
import { UserMenu, type ApplicationUser } from "./user-menu";

type MenuItem = Required<MenuProps>["items"][number];

function toMenuItem(item: NavItem): MenuItem {
  const Icon = item.icon;
  return {
    key: item.href,
    icon: Icon && <Icon size={16} aria-hidden />,
    label: <Link href={item.href}>{item.label}</Link>,
  };
}

const MENU_ITEMS: MenuItem[] = APPLICATION_NAVIGATION.flatMap((group) =>
  group.label
    ? [
        {
          type: "group" as const,
          key: group.label,
          label: <span className="uppercase tracking-wide">{group.label}</span>,
          children: group.items.map(toMenuItem),
        },
      ]
    : group.items.map(toMenuItem),
);

const ALL_HREFS = APPLICATION_NAVIGATION.flatMap((group) => group.items.map((item) => item.href));

export function ApplicationSidebar({ user }: { user: ApplicationUser }) {
  const pathname = usePathname();
  const selectedKeys = ALL_HREFS.filter((href) => isActiveHref(pathname, href));

  return (
    <Layout.Sider width={256} theme="light" className="sticky top-0 hidden h-dvh lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Logo href="/application/dashboard" subtitle="Cổng sinh viên" />
        </div>
        <nav aria-label="Điều hướng chính" className="min-h-0 flex-1 overflow-y-auto py-3">
          <Menu mode="inline" items={MENU_ITEMS} selectedKeys={selectedKeys} className="border-0" />
        </nav>
        <div className="shrink-0 px-3 py-3">
          <UserMenu user={user} />
        </div>
      </div>
    </Layout.Sider>
  );
}
