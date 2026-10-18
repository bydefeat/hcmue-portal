import type { ComponentType } from "react";
import {
  AlertWarning,
  BookOpen,
  Books,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartPie,
  ClipboardCheck,
  GraduationCap,
  House,
  HouseDashboard,
  IdBadge,
  Megaphone,
  PresentationScreen,
  Route,
  School,
  User,
  UserCap,
  Users,
  UsersLink,
  UsersStar,
  type IconProps,
} from "defeat-icons-react";

export type NavItem = {
  label: string;
  href: string;
  icon?: ComponentType<IconProps>;
  shortLabel?: string;
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  icon: ComponentType<IconProps>;
  items: NavItem[];
};

export const PUBLIC_SIGN_IN_HREF = "/authentication/sign-in";

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

export const LECTURER_HOME_HREF = "/lecturer";

export const LECTURER_NAVIGATION: NavItem[] = [
  { label: "Tổng quan", href: LECTURER_HOME_HREF, icon: HouseDashboard, exact: true },
  { label: "Lịch dạy", href: "/lecturer/schedule", icon: CalendarDays },
  { label: "Lớp học phần", shortLabel: "Lớp", href: "/lecturer/classes", icon: PresentationScreen },
];

export const LECTURER_ADVISING_GROUP: NavGroup = {
  label: "Cố vấn",
  icon: UsersStar,
  items: [
    { label: "Sinh viên cố vấn", href: "/lecturer/advising/students", icon: Users },
    { label: "Kế hoạch học tập", href: "/lecturer/advising/study-plans", icon: Route },
    { label: "Cảnh báo học vụ", href: "/lecturer/advising/academic-warnings", icon: AlertWarning },
  ],
};

export const LECTURER_ADVISING_HREF = "/lecturer/advising";

export const ADMINISTRATOR_HOME_HREF = "/administrator";

export const ADMINISTRATOR_NAVIGATION: NavGroup[] = [
  {
    label: "Chung",
    icon: House,
    items: [
      { label: "Tổng quan", href: ADMINISTRATOR_HOME_HREF, icon: HouseDashboard, exact: true },
      { label: "Thông báo", href: "/administrator/announcements", icon: Megaphone },
    ],
  },
  {
    label: "Đào tạo",
    icon: School,
    items: [
      { label: "Chương trình đào tạo", href: "/administrator/programs", icon: BookOpen },
      { label: "Học phần", href: "/administrator/courses", icon: Books },
      { label: "Lớp học phần", shortLabel: "Lớp HP", href: "/administrator/class-sections", icon: PresentationScreen },
    ],
  },
  {
    label: "Học vụ",
    icon: GraduationCap,
    items: [{ label: "Học kỳ và đợt đăng ký", shortLabel: "Học kỳ", href: "/administrator/terms", icon: CalendarClock }],
  },
  {
    label: "Người dùng",
    icon: Users,
    items: [
      { label: "Sinh viên", href: "/administrator/users/students", icon: UserCap },
      { label: "Giảng viên", href: "/administrator/users/lecturers", icon: IdBadge },
      { label: "Phân công cố vấn", href: "/administrator/users/advisors", icon: UsersLink },
    ],
  },
  {
    label: "Báo cáo",
    icon: ChartColumn,
    items: [
      { label: "Thống kê học vụ", shortLabel: "Thống kê", href: "/administrator/reports", icon: ChartPie, exact: true },
      { label: "Cảnh báo học vụ", href: "/administrator/reports/academic-warnings", icon: AlertWarning },
    ],
  },
];

export const ADMINISTRATOR_BOTTOM_TABS = [
  ADMINISTRATOR_HOME_HREF,
  "/administrator/class-sections",
  "/administrator/users/students",
  "/administrator/reports",
];

export function isActiveHref(pathname: string, href: string, exact = false) {
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActiveItem(pathname: string, item: NavItem) {
  return isActiveHref(pathname, item.href, item.exact);
}
