import type { ComponentType } from "react";
import {
  ApartmentBuilding,
  AwardCertificate,
  BookOpen,
  Books,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarGrid,
  CalendarUser,
  ChartActivity,
  FilePen,
  ChartColumn,
  ChartPie,
  ClipboardCheck,
  ClipboardList,
  EnvelopeClock,
  FileContent,
  Gauge,
  Gear,
  GraduationCap,
  History,
  House,
  HouseDashboard,
  IdBadge,
  Inbox,
  Megaphone,
  PresentationScreen,
  Receipt,
  Route,
  School,
  ScrollText,
  ShieldUser,
  Sliders,
  StarList,
  Suitcase,
  TableDownload,
  User,
  UserAlert,
  UserCap,
  UserChange,
  UserLock,
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
  permission?: string | string[];
  schoolWide?: boolean;
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
      { label: "Đơn từ", href: "/application/requests", icon: Inbox },
      { label: "Học phí", href: "/application/tuition", icon: Receipt },
      { label: "Thông báo chung", href: "/application/announcements", icon: Megaphone },
    ],
  },
  {
    label: "Học tập",
    icon: Books,
    items: [
      { label: "Thời khóa biểu", shortLabel: "Lịch học", href: "/application/schedule", icon: CalendarDays },
      { label: "Lớp học phần", shortLabel: "Lớp", href: "/application/classes", icon: PresentationScreen },
      { label: "Lịch thi", href: "/application/exams", icon: CalendarClock },
      { label: "Kết quả học tập", shortLabel: "Kết quả", href: "/application/grades", icon: ChartColumn },
      { label: "Khảo sát giảng dạy", href: "/application/surveys", icon: StarList },
    ],
  },
  {
    label: "Đào tạo",
    icon: School,
    items: [
      { label: "Chương trình đào tạo", href: "/application/curriculum", icon: BookOpen },
      { label: "Kế hoạch học tập", href: "/application/study-plan", icon: Route },
      { label: "Lịch hẹn cố vấn", href: "/application/advising", icon: CalendarUser },
    ],
  },
];

export const APPLICATION_PROFILE: NavItem = { label: "Hồ sơ", href: "/application/profile", icon: User };

export const APPLICATION_NOTIFICATIONS_HREF = "/application/notifications";

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
  { label: "Lịch thi", href: "/lecturer/exams", icon: CalendarClock },
  { label: "Đơn từ", href: "/lecturer/requests", icon: Inbox },
  { label: "Thông báo", href: "/lecturer/announcements", icon: Megaphone },
];

export const LECTURER_DOCK_ITEMS = LECTURER_NAVIGATION.slice(0, 3);

export const LECTURER_ADVISING_GROUP: NavGroup = {
  label: "Cố vấn",
  icon: UsersStar,
  items: [
    { label: "Sinh viên cố vấn", href: "/lecturer/advising/students", icon: Users },
    { label: "Kế hoạch học tập", href: "/lecturer/advising/study-plans", icon: Route },
    { label: "Cảnh báo học vụ", href: "/lecturer/advising/academic-warnings", icon: UserAlert },
    { label: "Lịch hẹn", href: "/lecturer/advising/appointments", icon: CalendarUser },
  ],
};

export const LECTURER_PORTAL_LINK: NavItem = { label: "Sang cổng giảng viên", href: "/lecturer", icon: PresentationScreen };
export const ADMINISTRATOR_PORTAL_LINK: NavItem = { label: "Sang cổng quản trị", href: "/administrator", icon: ShieldUser };

export const LECTURER_ACCOUNT_LINKS: NavItem[] = [
  { label: "Hồ sơ cá nhân", href: "/lecturer/profile", icon: User },
  { label: "Khối lượng giảng dạy", href: "/lecturer/workload", icon: Gauge },
];

export const LECTURER_NOTIFICATIONS_HREF = "/lecturer/notifications";

export const LECTURER_ADVISING_HREF = "/lecturer/advising";

export const ADMINISTRATOR_HOME_HREF = "/administrator";

export const ADMINISTRATOR_NOTIFICATIONS_HREF = "/administrator/notifications";

export const ADMINISTRATOR_NAVIGATION: NavGroup[] = [
  {
    label: "Chung",
    icon: House,
    items: [
      { label: "Tổng quan", href: ADMINISTRATOR_HOME_HREF, icon: HouseDashboard, exact: true, permission: "dashboard.view" },
      { label: "Đơn từ", href: "/administrator/requests", icon: Inbox, permission: "requests.process" },
      { label: "Thông báo", href: "/administrator/announcements", icon: Megaphone, permission: "announcements.manage" },
    ],
  },
  {
    label: "Đào tạo",
    icon: School,
    items: [
      { label: "Chương trình đào tạo", href: "/administrator/programs", icon: BookOpen, permission: "curriculum.manage" },
      { label: "Học phần", href: "/administrator/courses", icon: Books, permission: "curriculum.manage" },
      { label: "Lớp học phần", shortLabel: "Lớp HP", href: "/administrator/class-sections", icon: PresentationScreen, permission: "class-sections.manage" },
      { label: "Phân công giảng dạy", href: "/administrator/teaching-assignments", icon: Suitcase, permission: "teaching.assign" },
      { label: "Phòng học", href: "/administrator/rooms", icon: ApartmentBuilding, permission: "facilities.manage" },
    ],
  },
  {
    label: "Học vụ",
    icon: GraduationCap,
    items: [
      { label: "Học kỳ và đợt đăng ký", shortLabel: "Học kỳ", href: "/administrator/terms", icon: CalendarClock, permission: "registration.manage" },
      { label: "Theo dõi đăng ký", href: "/administrator/registration-monitor", icon: ChartActivity, permission: "registration.manage" },
      { label: "Khóa đăng ký", href: "/administrator/registration-holds", icon: UserLock, permission: ["registration.manage", "tuition.manage"] },
      { label: "Học phí", href: "/administrator/tuition", icon: Receipt, permission: "tuition.manage" },
      { label: "Duyệt và công bố điểm", href: "/administrator/grade-publishing", icon: ClipboardCheck, permission: ["grades.approve", "grades.publish"] },
      { label: "Sửa điểm sau công bố", href: "/administrator/grade-amendments", icon: FilePen, permission: "grades.publish" },
      { label: "Quyết định sinh viên", href: "/administrator/decisions", icon: ScrollText, permission: ["decisions.manage", "decisions.sign"] },
      { label: "Xét tốt nghiệp", href: "/administrator/graduation", icon: AwardCertificate, permission: "graduation.manage" },
    ],
  },
  {
    label: "Khảo thí",
    icon: ClipboardList,
    items: [
      { label: "Lịch thi", href: "/administrator/exams", icon: CalendarCheck, exact: true, permission: "exams.manage" },
      { label: "Điều kiện dự thi", href: "/administrator/exams/eligibility", icon: UserChange, permission: "exams.manage" },
    ],
  },
  {
    label: "Người dùng",
    icon: Users,
    items: [
      { label: "Sinh viên", href: "/administrator/users/students", icon: UserCap, permission: "students.view" },
      { label: "Giảng viên", href: "/administrator/users/lecturers", icon: IdBadge, permission: "lecturers.manage" },
      { label: "Phân công cố vấn", href: "/administrator/users/advisors", icon: UsersLink, permission: "advisors.assign" },
      { label: "Cán bộ", href: "/administrator/users/staff", icon: Users, permission: "access.manage", schoolWide: true },
    ],
  },
  {
    label: "Báo cáo",
    icon: ChartColumn,
    items: [
      { label: "Thống kê học vụ", shortLabel: "Thống kê", href: "/administrator/reports", icon: ChartPie, exact: true, permission: "reports.view" },
      { label: "Cảnh báo học vụ", href: "/administrator/reports/academic-warnings", icon: UserAlert, permission: "reports.view" },
      { label: "Khảo sát giảng dạy", href: "/administrator/reports/surveys", icon: StarList, permission: "surveys.view" },
      { label: "Xuất báo cáo", href: "/administrator/reports/exports", icon: TableDownload, permission: "reports.view" },
    ],
  },
  {
    label: "Hệ thống",
    icon: Gear,
    items: [
      { label: "Quy chế đào tạo", href: "/administrator/settings", icon: Sliders, exact: true, permission: "settings.manage" },
      { label: "Lịch năm học", href: "/administrator/settings/calendar", icon: CalendarGrid, permission: "settings.manage" },
      { label: "Phân quyền", href: "/administrator/settings/access", icon: ShieldUser, permission: "access.manage" },
      { label: "Nhật ký thao tác", href: "/administrator/settings/audit-log", icon: History, permission: "audit.view" },
      { label: "Hàng đợi thư", href: "/administrator/settings/mail", icon: EnvelopeClock, permission: "settings.manage", schoolWide: true },
    ],
  },
];

export const ADMINISTRATOR_BOTTOM_TABS = [
  ADMINISTRATOR_HOME_HREF,
  "/administrator/requests",
  "/administrator/users/students",
  "/administrator/reports",
];

export const ADMINISTRATOR_ACCOUNT_LINKS: NavItem[] = [{ label: "Hồ sơ cá nhân", href: "/administrator/profile", icon: FileContent }];

function hasAny(permissions: string[], required: NavItem["permission"]) {
  if (!required) return true;
  return (Array.isArray(required) ? required : [required]).some((permission) => permissions.includes(permission));
}

export function filterNavigation(groups: NavGroup[], permissions: string[], scope: { schoolWide: boolean } = { schoolWide: true }) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAny(permissions, item.permission) && (!item.schoolWide || scope.schoolWide)),
    }))
    .filter((group) => group.items.length > 0);
}

export function firstAccessibleHref(groups: NavGroup[], permissions: string[], scope: { schoolWide: boolean }) {
  return filterNavigation(groups, permissions, scope)[0]?.items[0]?.href ?? null;
}

export function isActiveHref(pathname: string, href: string, exact = false) {
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isActiveItem(pathname: string, item: NavItem) {
  return isActiveHref(pathname, item.href, item.exact);
}
