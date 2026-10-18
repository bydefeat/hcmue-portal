import type { ComponentType } from "react";
import {
  BookOpen,
  Books,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  GraduationCap,
  House,
  HouseDashboard,
  Megaphone,
  Route,
  School,
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
  label: string;
  icon: ComponentType<IconProps>;
  items: NavItem[];
};

export const PUBLIC_NAVIGATION: NavItem[] = [
  { label: "Trang chủ", href: "/", icon: House },
  { label: "Thông báo", href: "/announcements", icon: Megaphone },
  { label: "Giới thiệu", href: "/about", icon: School },
];

export const APPLICATION_NAVIGATION: NavGroup[] = [
  {
    label: "Học vụ",
    icon: GraduationCap,
    items: [
      { label: "Tổng quan", shortLabel: "Tổng quan", href: "/application/dashboard", icon: HouseDashboard },
      { label: "Đăng ký học phần", shortLabel: "Đăng ký", href: "/application/registration", icon: ClipboardCheck },
    ],
  },
  {
    label: "Học tập",
    icon: Books,
    items: [
      { label: "Thời khóa biểu", shortLabel: "Lịch học", href: "/application/schedule", icon: CalendarDays },
      { label: "Lịch thi", href: "/application/exams", icon: CalendarClock },
      { label: "Kết quả học tập", shortLabel: "Kết quả", href: "/application/grades", icon: ChartColumn },
    ],
  },
  {
    label: "Đào tạo",
    icon: School,
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
