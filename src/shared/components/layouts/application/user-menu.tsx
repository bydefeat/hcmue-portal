"use client";

import Link from "next/link";
import { Avatar, Dropdown, type MenuProps } from "antd";
import { ArrowDoorOut, ChevronExpandY } from "defeat-icons-react";
import { APPLICATION_PROFILE } from "@/shared/constants/navigation.constant";

export type ApplicationUser = {
  name: string;
  studentCode: string;
};

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  return words.at(-1)?.[0]?.toUpperCase() ?? "";
}

export function UserMenu({ user, compact = false }: { user: ApplicationUser; compact?: boolean }) {
  const ProfileIcon = APPLICATION_PROFILE.icon!;
  const items: MenuProps["items"] = [
    {
      key: "account",
      type: "group",
      label: (
        <span className="flex flex-col gap-1">
          <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="truncate font-mono text-xs text-muted">{user.studentCode}</span>
        </span>
      ),
    },
    { type: "divider" },
    {
      key: APPLICATION_PROFILE.href,
      icon: <ProfileIcon size={16} aria-hidden />,
      label: <Link href={APPLICATION_PROFILE.href}>{APPLICATION_PROFILE.label}</Link>,
    },
    { type: "divider" },
    // Đăng xuất: việc kết thúc phiên nên mang tông nguy hiểm (luật khoá 1). Logic nối ở giai đoạn auth.
    { key: "sign-out", danger: true, icon: <ArrowDoorOut size={16} aria-hidden />, label: "Đăng xuất" },
  ];

  const avatar = (
    <Avatar size={32} className="shrink-0 bg-primary-light font-medium text-primary">
      {initialsOf(user.name)}
    </Avatar>
  );

  return (
    <Dropdown
      menu={{ items }}
      trigger={["click"]}
      placement={compact ? "bottomRight" : "topLeft"}
      overlayClassName="min-w-56"
    >
      {compact ? (
        <button type="button" aria-label="Tài khoản" className="flex cursor-pointer rounded-full">
          {avatar}
        </button>
      ) : (
        <button
          type="button"
          className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl px-1 text-left transition-colors hover:bg-item-hover"
        >
          {avatar}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
          <ChevronExpandY size={16} aria-hidden className="shrink-0 text-muted" />
        </button>
      )}
    </Dropdown>
  );
}
