"use client";

import { Button, Card, Result } from "antd";

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
    <Card role="alert">
      <Result status="error" title={title} subTitle={description} extra={onRetry ? <Button onClick={onRetry}>Thử lại</Button> : undefined} />
    </Card>
  );
}
