import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";

// Bộ nhận diện thương hiệu (README). Nguồn màu DUY NHẤT của app: CSS variables cho Tailwind
// và ThemeConfig cho antd đều sinh từ đây. Không rải mã màu ở nơi khác (docs/UI-RULES.md).
export const BRAND = {
  cerulean: "#124874",
  // Chỉ cho logo và dấu hiệu thương hiệu, không cho nút hay trạng thái: đỏ trong app đọc là "lỗi".
  jasper: "#CF373D",
} as const;

export const COLORS = {
  primary: BRAND.cerulean,
  primaryHover: `color-mix(in oklab, ${BRAND.cerulean} 85%, #f4f4f6)`,
  primaryForeground: "#ffffff",
  primaryLight: `${BRAND.cerulean}0d`,
  ringFocus: `${BRAND.cerulean}1a`,
  brandAccent: BRAND.jasper,
  background: "#f4f4f6",
  surface: "#ffffff",
  surfaceHover: "#f8f8fa",
  foreground: "#2c2c2c",
  foregroundSoft: "rgba(44, 44, 44, 0.7)",
  muted: "#707070",
  border: "#f0f0f2",
  borderStrong: "#eaeaea",
  secondary: "#e7e8ec",
  itemHover: "#f4f4f6",
} as const;

// Gắn lên <html>, globals.css map sang class Tailwind (bg-primary, text-muted...).
export const CSS_VARIABLES = {
  "--primary": COLORS.primary,
  "--primary-hover": COLORS.primaryHover,
  "--primary-foreground": COLORS.primaryForeground,
  "--primary-light": COLORS.primaryLight,
  "--ring-focus": COLORS.ringFocus,
  "--brand-accent": COLORS.brandAccent,
  "--background": COLORS.background,
  "--surface": COLORS.surface,
  "--surface-hover": COLORS.surfaceHover,
  "--foreground": COLORS.foreground,
  "--muted": COLORS.muted,
  "--border": COLORS.border,
  "--border-strong": COLORS.borderStrong,
  "--secondary": COLORS.secondary,
  "--item-hover": COLORS.itemHover,
} as CSSProperties;

export const THEME: ThemeConfig = {
  token: {
    colorPrimary: COLORS.primary,
    colorLink: COLORS.primary,
    colorText: COLORS.foreground,
    colorTextSecondary: COLORS.muted,
    colorBgLayout: COLORS.background,
    colorBgContainer: COLORS.surface,
    colorBorder: COLORS.borderStrong,
    colorBorderSecondary: COLORS.border,
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: 14,
    // Bo theo chiều cao: dưới 40px là 8, từ 40px là 12 (luật khoá 10).
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 40,
    // Không vẽ vòng focus ở nút, menu, tab; chỉ ô nhập có viền + ring khi focus (I13, luật khoá 16).
    lineWidthFocus: 0,
  },
  components: {
    Layout: {
      bodyBg: COLORS.background,
      headerBg: COLORS.surface,
      lightSiderBg: COLORS.surface,
      footerBg: COLORS.primary,
      headerHeight: 64,
      headerPadding: 0,
      footerPadding: 0,
    },
    Menu: {
      itemBg: "transparent",
      subMenuItemBg: "transparent",
      itemColor: COLORS.foregroundSoft,
      itemHoverColor: COLORS.foreground,
      itemHoverBg: COLORS.itemHover,
      // Mục đang chọn: nền xám + chữ đậm, không tô màu nhấn (I15).
      itemSelectedBg: COLORS.secondary,
      itemSelectedColor: COLORS.foreground,
      itemActiveBg: COLORS.secondary,
      itemHeight: 40,
      itemBorderRadius: 12,
      itemMarginBlock: 4,
      itemMarginInline: 0,
      iconSize: 16,
      groupTitleColor: COLORS.muted,
      groupTitleFontSize: 12,
      activeBarBorderWidth: 0,
      // Menu ngang của trang public: tab đang chọn là chữ + vạch dưới màu nhấn.
      horizontalItemSelectedColor: COLORS.primary,
      horizontalItemHoverColor: COLORS.primary,
      horizontalLineHeight: "62px",
    },
    Button: {
      fontWeight: 500,
      primaryShadow: "none",
      defaultShadow: "none",
      dangerShadow: "none",
    },
  },
};
