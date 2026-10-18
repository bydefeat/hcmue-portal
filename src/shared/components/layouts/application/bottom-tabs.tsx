"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer, Menu } from "antd";
import { Dots } from "defeat-icons-react";
import {
  APPLICATION_BOTTOM_TABS,
  APPLICATION_NAVIGATION,
  isActiveHref,
} from "@/shared/constants/navigation.constant";

const ALL_ITEMS = APPLICATION_NAVIGATION.flatMap((group) => group.items);
const TAB_ITEMS = ALL_ITEMS.filter((item) => APPLICATION_BOTTOM_TABS.includes(item.href));
const MORE_ITEMS = ALL_ITEMS.filter((item) => !APPLICATION_BOTTOM_TABS.includes(item.href));

const TAB_CLASS =
  "flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 text-xs outline-hidden transition-colors";

export function BottomTabs() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = MORE_ITEMS.some((item) => isActiveHref(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border-strong bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon!;
          const isActive = isActiveHref(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`${TAB_CLASS} h-16 ${isActive ? "font-medium text-primary" : "text-muted hover:text-foreground"}`}
            >
              <Icon size={20} aria-hidden />
              <span className="max-w-full truncate px-1">{item.shortLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          className={`${TAB_CLASS} h-16 ${isMoreActive ? "font-medium text-primary" : "text-muted hover:text-foreground"}`}
        >
          <Dots size={20} aria-hidden />
          <span>Thêm</span>
        </button>
      </nav>

      <Drawer title="Thêm" placement="bottom" size="auto" open={isMoreOpen} onClose={() => setIsMoreOpen(false)}>
        <Menu
          mode="inline"
          selectedKeys={MORE_ITEMS.filter((item) => isActiveHref(pathname, item.href)).map((item) => item.href)}
          onClick={() => setIsMoreOpen(false)}
          className="border-0"
          items={MORE_ITEMS.map((item) => {
            const Icon = item.icon!;
            return {
              key: item.href,
              icon: <Icon size={16} aria-hidden />,
              label: <Link href={item.href}>{item.label}</Link>,
            };
          })}
        />
      </Drawer>
    </>
  );
}
