"use client";

import { useState } from "react";
import { Button, message } from "antd";
import { Download } from "defeat-icons-react";
import type { ActionResult } from "@/shared/libs/action.lib";
import { downloadBase64 } from "@/shared/libs/download.lib";

export type PdfFileResult = ActionResult<{ fileName: string; base64: string; mimeType: string }>;

export function DownloadPdfButton({ action, label = "Tải PDF" }: { action: () => Promise<PdfFileResult>; label?: string }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [isLoading, setIsLoading] = useState(false);

  const download = async () => {
    setIsLoading(true);
    const result = await action().catch(() => null);
    setIsLoading(false);
    if (!result) {
      messageApi.error("Chưa tạo được tệp PDF, kiểm tra kết nối rồi thử lại.");
      return;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return;
    }
    downloadBase64(result.data.fileName, result.data.base64, result.data.mimeType);
  };

  return (
    <>
      {contextHolder}
      <Button icon={<Download size={16} aria-hidden className="text-zinc-500" />} loading={isLoading} onClick={() => void download()} className="print:hidden">
        {label}
      </Button>
    </>
  );
}
