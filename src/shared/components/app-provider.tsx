"use client";

import { ProgressProvider } from "@bprogress/next/app";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { COLORS, THEME } from "@/shared/constants/theme.constant";

dayjs.locale("vi");

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={THEME} locale={viVN}>
      <ProgressProvider height="3px" color={COLORS.brandAccent} options={{ showSpinner: false }} shallowRouting>
        {children}
      </ProgressProvider>
    </ConfigProvider>
  );
}
