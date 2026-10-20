"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu, type MenuProps } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { NotificationBell, type BellItem, type MarkNotificationsRead } from "@/shared/components/ui/notification-bell";
import { UserMenu, type MenuUser } from "@/shared/components/ui/user-menu";
import {
  isActiveItem,
  LECTURER_ACCOUNT_LINKS,
  LECTURER_ADVISING_GROUP,
  LECTURER_HOME_HREF,
  LECTURER_NAVIGATION,
  LECTURER_NOTIFICATIONS_HREF,
  type NavItem,
} from "@/shared/constants/navigation.constant";

const ADVISING_KEY = "advising";

function iconClass(isActive: boolean) {
  return isActive ? undefined : "text-zinc-500";
}

function menuItem(item: NavItem, pathname: string) {
  const Icon = item.icon;
  return {
    key: item.href,
    icon: Icon ? <Icon size={16} aria-hidden className={iconClass(isActiveItem(pathname, item))} /> : undefined,
    label: <Link href={item.href}>{item.label}</Link>,
  };
}

type LecturerHeaderProps = {
  user: MenuUser;
  isAdvisor: boolean;
  notifications: BellItem[];
  unreadNotifications?: number;
  onMarkNotificationsRead?: MarkNotificationsRead;
};

export function LecturerHeader({ user, isAdvisor, notifications, unreadNotifications, onMarkNotificationsRead }: LecturerHeaderProps) {
  const pathname = usePathname();
  const AdvisingIcon = LECTURER_ADVISING_GROUP.icon;
  const isAdvisingActive = LECTURER_ADVISING_GROUP.items.some((item) => isActiveItem(pathname, item));
  const items: MenuProps["items"] = [
    ...LECTURER_NAVIGATION.map((item) => menuItem(item, pathname)),
    ...(isAdvisor
      ? [
          {
            key: ADVISING_KEY,
            icon: <AdvisingIcon size={16} aria-hidden className={iconClass(isAdvisingActive)} />,
            label: LECTURER_ADVISING_GROUP.label,
            children: LECTURER_ADVISING_GROUP.items.map((item) => menuItem(item, pathname)),
          },
        ]
      : []),
  ];
  const selectedKeys = [...LECTURER_NAVIGATION, ...LECTURER_ADVISING_GROUP.items]
    .filter((item) => isActiveItem(pathname, item))
    .map((item) => item.href);
  if (isAdvisingActive) selectedKeys.push(ADVISING_KEY);

  return (
    <Layout.Header className="sticky top-0 z-20 border-b border-border-strong print:!hidden">
      <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Logo href={LECTURER_HOME_HREF} subtitle="Cổng giảng viên" className="mr-4 shrink-0" />
        <Menu
          mode="horizontal"
          items={items}
          selectedKeys={selectedKeys}
          disabledOverflow
          className="hidden min-w-0 flex-1 border-0 md:flex"
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 leading-normal">
          <NotificationBell items={notifications} unreadCount={unreadNotifications} viewAllHref={LECTURER_NOTIFICATIONS_HREF} onMarkRead={onMarkNotificationsRead} />
          <UserMenu user={user} links={LECTURER_ACCOUNT_LINKS} compact />
        </div>
      </div>
    </Layout.Header>
  );
}
