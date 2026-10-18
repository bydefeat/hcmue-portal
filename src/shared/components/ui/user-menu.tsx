"use client";

import Link from "next/link";
import { Avatar, Button, Dropdown, type MenuProps } from "antd";
import { ArrowDoorOut, ChevronExpandY } from "defeat-icons-react";
import type { NavItem } from "@/shared/constants/navigation.constant";

export type MenuUser = {
  name: string;
  code: string;
  role?: string;
};

type UserMenuProps = {
  user: MenuUser;
  links?: NavItem[];
  compact?: boolean;
};

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  return words.at(-1)?.[0]?.toUpperCase() ?? "";
}

export function UserMenu({ user, links = [], compact = false }: UserMenuProps) {
  const linkItems: MenuProps["items"] = links.map((link) => {
    const Icon = link.icon;
    return {
      key: link.href,
      icon: Icon ? <Icon size={16} aria-hidden /> : undefined,
      label: <Link href={link.href}>{link.label}</Link>,
    };
  });

  const items: MenuProps["items"] = [
    {
      key: "account",
      type: "group",
      label: (
        <span className="flex flex-col gap-1">
          <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="truncate font-mono text-xs text-muted">{user.code}</span>
          {user.role && <span className="truncate text-xs text-muted">{user.role}</span>}
        </span>
      ),
    },
    { type: "divider" },
    ...linkItems,
    ...(linkItems.length > 0 ? [{ type: "divider" as const }] : []),
    { key: "sign-out", danger: true, icon: <ArrowDoorOut size={16} aria-hidden />, label: <Link href="/authentication/sign-in">Đăng xuất</Link> },
  ];

  const avatar = (
    <Avatar size={32} className="shrink-0 bg-primary-light font-medium text-primary">
      {initialsOf(user.name)}
    </Avatar>
  );

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement={compact ? "bottomRight" : "topLeft"}>
      {compact ? (
        <Button type="text" shape="circle" aria-label="Tài khoản" icon={avatar} />
      ) : (
        <Button type="text" block className="h-auto justify-start px-1 py-1 text-left">
          {avatar}
          <span className="min-w-0 flex-1 truncate font-medium">{user.name}</span>
          <ChevronExpandY size={16} aria-hidden className="shrink-0 text-muted" />
        </Button>
      )}
    </Dropdown>
  );
}
