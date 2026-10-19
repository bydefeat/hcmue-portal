"use client";

import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Avatar, Button, Dropdown, type MenuProps } from "antd";
import { ArrowDoorOut, Check, ChevronExpandY, UserChange } from "defeat-icons-react";
import type { NavItem } from "@/shared/constants/navigation.constant";
import { authClient } from "@/shared/libs/auth-client.lib";

export type MenuUser = {
  name: string;
  code: string;
  role?: string;
};

export type RoleSwitcher = {
  current: string;
  options: { value: string; label: string; description: string }[];
  action: (formData: FormData) => void | Promise<void>;
};

type UserMenuProps = {
  user: MenuUser;
  links?: NavItem[];
  switcher?: RoleSwitcher;
  compact?: boolean;
};

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  return words.at(-1)?.[0]?.toUpperCase() ?? "";
}

function switcherItems(switcher: RoleSwitcher): MenuProps["items"] {
  return [
    {
      key: "switch-role",
      icon: <UserChange size={16} aria-hidden />,
      label: "Xem thử với vai trò",
      children: switcher.options.map((option) => ({
        key: `role-${option.value}`,
        label: (
          <form action={switcher.action} className="contents">
            <input type="hidden" name="assignmentId" value={option.value} />
            <button type="submit" className="flex w-full cursor-pointer items-start gap-2 text-left">
              <span className="flex size-4 shrink-0 items-center pt-0.5">
                {option.value === switcher.current && <Check size={14} aria-label="Đang dùng" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">{option.label}</span>
                <span className="text-xs text-muted">{option.description}</span>
              </span>
            </button>
          </form>
        ),
      })),
    },
    { type: "divider" },
  ];
}

export function UserMenu({ user, links = [], switcher, compact = false }: UserMenuProps) {
  const router = useRouter();
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
          <span className="truncate text-xs text-muted">{user.code}</span>
          {user.role && <span className="max-w-64 text-xs text-pretty text-muted">{user.role}</span>}
        </span>
      ),
    },
    { type: "divider" },
    ...linkItems,
    ...(linkItems.length > 0 ? [{ type: "divider" as const }] : []),
    ...(switcher ? switcherItems(switcher) ?? [] : []),
    {
      key: "sign-out",
      danger: true,
      icon: <ArrowDoorOut size={16} aria-hidden />,
      label: "Đăng xuất",
      onClick: async () => {
        await authClient.signOut();
        router.replace("/authentication/sign-in");
        router.refresh();
      },
    },
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
