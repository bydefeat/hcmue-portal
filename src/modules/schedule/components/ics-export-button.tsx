"use client";

import { Button, message } from "antd";
import { CalendarDownload } from "defeat-icons-react";
import { buildIcs } from "@/modules/schedule/schedule.ics";
import type { ScheduleSession } from "@/modules/schedule/schedule.type";

type IcsExportButtonProps = {
  sessions: ScheduleSession[];
  calendarName: string;
  fileName: string;
};

export function IcsExportButton({ sessions, calendarName, fileName }: IcsExportButtonProps) {
  const [messageApi, contextHolder] = message.useMessage();

  const download = () => {
    const content = buildIcs({ calendarName, sessions, generatedAt: new Date().toISOString() });
    const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    messageApi.success(`Đã tải ${fileName}. Mở tệp bằng Google Calendar, Outlook hoặc Lịch trên điện thoại để thêm lịch học.`);
  };

  return (
    <>
      {contextHolder}
      <Button icon={<CalendarDownload size={16} aria-hidden className="text-zinc-500" />} disabled={sessions.length === 0} onClick={download}>
        Xuất lịch .ics
      </Button>
    </>
  );
}
