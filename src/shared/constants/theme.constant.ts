import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";

export const BRAND = {
  cerulean: "#124874",
  jasper: "#CF373D",
} as const;

export const COLORS = {
  primary: BRAND.cerulean,
  primaryHover: `color-mix(in oklab, ${BRAND.cerulean} 85%, #f4f4f6)`,
  primaryForeground: "#ffffff",
  primaryLight: `${BRAND.cerulean}0d`,
  brandAccent: BRAND.jasper,
  primaryTint: "#c0e6fd",
  background: "#f4f4f6",
  surface: "#ffffff",
  surfaceHover: "#f8f8fa",
  foreground: "#2c2c2c",
  muted: "#707070",
  border: "#f0f0f2",
  borderStrong: "#eaeaea",
  itemHover: "#f4f4f6",
} as const;

export const CSS_VARIABLES = {
  "--primary": COLORS.primary,
  "--primary-hover": COLORS.primaryHover,
  "--primary-foreground": COLORS.primaryForeground,
  "--primary-light": COLORS.primaryLight,
  "--brand-accent": COLORS.brandAccent,
  "--primary-tint": COLORS.primaryTint,
  "--background": COLORS.background,
  "--surface": COLORS.surface,
  "--surface-hover": COLORS.surfaceHover,
  "--foreground": COLORS.foreground,
  "--muted": COLORS.muted,
  "--border": COLORS.border,
  "--border-strong": COLORS.borderStrong,
  "--item-hover": COLORS.itemHover,
} as CSSProperties;

export const THEME: ThemeConfig = {
  token: {
    colorPrimary: COLORS.primary,
    colorPrimaryBg: "#e3e9ee",
    colorPrimaryBgHover: "#d9e2e9",
    colorPrimaryBorder: "#b8c8d5",
    colorPrimaryBorderHover: "#89a4ba",
    colorLink: COLORS.primary,
    colorInfo: COLORS.primary,
    colorInfoBg: "#eef2f5",
    colorInfoBorder: "#c9d5df",
    colorText: COLORS.foreground,
    colorTextSecondary: COLORS.muted,
    colorBgLayout: COLORS.background,
    colorBgContainer: COLORS.surface,
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  components: {
    Layout: {
      headerBg: COLORS.surface,
      lightSiderBg: COLORS.surface,
      footerBg: COLORS.primary,
      headerPadding: 0,
      footerPadding: 0,
    },
  },
};
