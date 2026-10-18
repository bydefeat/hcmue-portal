"use client";

import { Button } from "antd";
import { CircleWarning } from "defeat-icons-react";

type ErrorStateProps = {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Không tải được dữ liệu",
  description = "Máy chủ không phản hồi. Kiểm tra kết nối mạng rồi thử lại, nếu vẫn lỗi hãy báo Phòng Đào tạo.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-12 text-center">
      <CircleWarning size={28} aria-hidden className="text-rose-700" />
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-sm text-sm text-pretty text-muted">{description}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-2">
          Thử lại
        </Button>
      )}
    </div>
  );
}
