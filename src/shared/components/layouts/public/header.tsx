"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Drawer, Layout, Menu } from "antd";
import { Menu as MenuIcon } from "defeat-icons-react";
import { Logo } from "@/shared/components/ui/logo";
import { isActiveHref, PUBLIC_NAVIGATION } from "@/shared/constants/navigation.constant";

const SIGN_IN_HREF = "/authentication/sign-in";

export function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const activeKeys = PUBLIC_NAVIGATION.filter((item) => isActiveHref(pathname, item.href)).map((item) => item.href);
  const items = PUBLIC_NAVIGATION.map((item) => ({
    key: item.href,
    label: <Link href={item.href}>{item.label}</Link>,
  }));

  return (
    <Layout.Header className="sticky top-0 z-10 border-b border-border">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Button
          type="text"
          aria-label="Mở menu"
          icon={<MenuIcon size={18} />}
          onClick={() => setIsDrawerOpen(true)}
          className="md:hidden"
        />
        <Logo subtitle="Cổng đào tạo & học vụ" className="mr-6" />
        <Menu
          mode="horizontal"
          items={items}
          selectedKeys={activeKeys}
          disabledOverflow
          className="hidden min-w-0 flex-1 border-0 md:flex"
        />
        <Button type="primary" onClick={() => router.push(SIGN_IN_HREF)} className="ml-auto shrink-0">
          Đăng nhập
        </Button>
      </div>

      <Drawer
        placement="left"
        size={280}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={<Logo subtitle="Cổng đào tạo & học vụ" />}
      >
        <Menu
          mode="inline"
          items={items}
          selectedKeys={activeKeys}
          onClick={() => setIsDrawerOpen(false)}
          className="border-0"
        />
      </Drawer>
    </Layout.Header>
  );
}
