"use client";

import "@rc-component/portal";
import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { THEME } from "@/shared/constants/theme.constant";

dayjs.locale("vi");

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={THEME} locale={viVN}>
      {children}
    </ConfigProvider>
  );
}
