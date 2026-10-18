"use client";

import { ConfigProvider } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { THEME } from "@/shared/constants/theme.constant";

dayjs.locale("vi");

export function AntdProvider({ children }: { children: React.ReactNode }) {
  // wave tắt: hiệu ứng sóng khi bấm là animate hình khối (F22).
  return (
    <ConfigProvider theme={THEME} locale={viVN} wave={{ disabled: true }}>
      {children}
    </ConfigProvider>
  );
}
