"use client";

import { Layout } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { NavSections } from "@/shared/components/ui/nav-tree";
import { UserMenu, type MenuUser } from "@/shared/components/ui/user-menu";
import { APPLICATION_NAVIGATION, APPLICATION_PROFILE } from "@/shared/constants/navigation.constant";

const PROFILE_LINKS = [APPLICATION_PROFILE];

export function ApplicationSidebar({ user }: { user: MenuUser }) {
  return (
    <Layout.Sider width={256} theme="light" className="sticky top-0 hidden h-dvh border-r border-border-strong lg:block">
      <div className="flex h-full flex-col select-none">
        <div className="flex h-16 shrink-0 items-center border-b border-border-strong px-4">
          <Logo href="/application/dashboard" subtitle="Cổng sinh viên" />
        </div>
        <nav aria-label="Điều hướng chính" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
          <NavSections groups={APPLICATION_NAVIGATION} idPrefix="sidebar-nav" />
        </nav>
        <div className="shrink-0 border-t border-border-strong p-3">
          <UserMenu user={user} links={PROFILE_LINKS} />
        </div>
      </div>
    </Layout.Sider>
  );
}
