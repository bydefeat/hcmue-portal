"use client";

import { Layout } from "antd";
import { MobileNavigation } from "@/shared/components/ui/mobile-navigation";
import type { MenuUser } from "@/shared/components/ui/user-menu";
import {
  LECTURER_ADVISING_GROUP,
  LECTURER_HOME_HREF,
  LECTURER_NAVIGATION,
} from "@/shared/constants/navigation.constant";
import { ClassContextBar, type ClassContext } from "./class-context-bar";
import { LecturerHeader } from "./header";

export type { ClassContext };

type LecturerLayoutProps = {
  user: MenuUser;
  isAdvisor: boolean;
  children: React.ReactNode;
};

export function LecturerLayout({ user, isAdvisor, children }: LecturerLayoutProps) {
  const sections = [
    { title: "Giảng dạy", items: LECTURER_NAVIGATION },
    ...(isAdvisor ? [{ title: LECTURER_ADVISING_GROUP.label, items: LECTURER_ADVISING_GROUP.items }] : []),
  ];

  return (
    <Layout className="min-h-dvh">
      <LecturerHeader user={user} isAdvisor={isAdvisor} />
      <Layout.Content className="mx-auto w-full max-w-7xl min-w-0 p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6">{children}</Layout.Content>
      <MobileNavigation dockItems={LECTURER_NAVIGATION} sections={sections} homeHref={LECTURER_HOME_HREF} hideFrom="md" />
    </Layout>
  );
}

export function LecturerClassLayout({ classContext, children }: { classContext: ClassContext; children: React.ReactNode }) {
  return (
    <>
      <ClassContextBar classContext={classContext} />
      {children}
    </>
  );
}
