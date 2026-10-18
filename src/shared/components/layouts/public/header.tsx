"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Layout, Menu } from "antd";
import { Logo } from "@/shared/components/ui/logo";
import { isActiveHref, PUBLIC_NAVIGATION, PUBLIC_SIGN_IN_HREF } from "@/shared/constants/navigation.constant";

export function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const activeKeys = PUBLIC_NAVIGATION.filter((item) => isActiveHref(pathname, item.href)).map((item) => item.href);
  const items = PUBLIC_NAVIGATION.map((item) => ({
    key: item.href,
    label: <Link href={item.href}>{item.label}</Link>,
  }));

  return (
    <Layout.Header className="sticky top-0 z-10 border-b border-border-strong">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo subtitle="Cổng đào tạo & học vụ" className="mr-6" />
        <Menu
          mode="horizontal"
          items={items}
          selectedKeys={activeKeys}
          disabledOverflow
          className="hidden min-w-0 flex-1 border-0 md:flex"
        />
        <Button type="primary" onClick={() => router.push(PUBLIC_SIGN_IN_HREF)} className="ml-auto shrink-0">
          Đăng nhập
        </Button>
      </div>
    </Layout.Header>
  );
}
