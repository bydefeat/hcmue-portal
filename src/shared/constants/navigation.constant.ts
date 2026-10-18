import type { ComponentType } from "react";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  HouseDashboard,
  Route,
  User,
  type IconProps,
} from "defeat-icons-react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ComponentType<IconProps>;
  shortLabel?: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const PUBLIC_NAVIGATION: NavItem[] = [
  { label: "Trang chủ", href: "/" },
  { label: "Thông báo", href: "/announcements" },
  { label: "Giới thiệu", href: "/about" },
];

export const APPLICATION_NAVIGATION: NavGroup[] = [
  {
    items: [
      { label: "Tổng quan", shortLabel: "Tổng quan", href: "/application/dashboard", icon: HouseDashboard },
      { label: "Đăng ký học phần", shortLabel: "Đăng ký", href: "/application/registration", icon: ClipboardCheck },
    ],
  },
  {
    label: "Học tập",
    items: [
      { label: "Thời khóa biểu", shortLabel: "Lịch học", href: "/application/schedule", icon: CalendarDays },
      { label: "Lịch thi", href: "/application/exams", icon: CalendarClock },
      { label: "Kết quả học tập", shortLabel: "Kết quả", href: "/application/grades", icon: ChartColumn },
    ],
  },
  {
    label: "Đào tạo",
    items: [
      { label: "Chương trình đào tạo", href: "/application/curriculum", icon: BookOpen },
      { label: "Kế hoạch học tập", href: "/application/study-plan", icon: Route },
    ],
  },
];

export const APPLICATION_PROFILE: NavItem = { label: "Hồ sơ", href: "/application/profile", icon: User };

export const APPLICATION_BOTTOM_TABS = [
  "/application/dashboard",
  "/application/registration",
  "/application/schedule",
  "/application/grades",
];

export function isActiveHref(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
