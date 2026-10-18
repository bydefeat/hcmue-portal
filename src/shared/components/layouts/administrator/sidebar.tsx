"use client";

import { Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { NavSections } from "@/shared/components/ui/nav-tree";
import { UserMenu, type MenuUser } from "@/shared/components/ui/user-menu";
import { ADMINISTRATOR_HOME_HREF, ADMINISTRATOR_NAVIGATION } from "@/shared/constants/navigation.constant";

export function AdministratorSidebar({ user }: { user: MenuUser }) {
  return (
    <Layout.Sider width={248} theme="light" className="sticky top-0 hidden h-dvh border-r border-border-strong lg:block">
      <div className="flex h-full flex-col select-none">
        <div className="flex h-16 shrink-0 items-center border-b border-border-strong px-4">
          <Logo href={ADMINISTRATOR_HOME_HREF} subtitle="Phòng Đào tạo" />
        </div>
        <nav aria-label="Điều hướng quản trị" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
          <NavSections groups={ADMINISTRATOR_NAVIGATION} idPrefix="administrator-nav" />
        </nav>
        <div className="shrink-0 border-t border-border-strong p-3">
          <UserMenu user={user} />
        </div>
      </div>
    </Layout.Sider>
  );
}
