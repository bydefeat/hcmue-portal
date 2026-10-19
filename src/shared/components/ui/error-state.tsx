"use client";

import { Button, Card, Result } from "antd";
import { Illustration } from "./illustration";

export function errorDigest(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && error.digest ? String(error.digest) : undefined;
}

type ErrorStateProps = {
  title?: string;
  description?: React.ReactNode;
  code?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
};

export function ErrorState({
  title = "Trang chưa tải được",
  description = "Hệ thống gặp lỗi khi tải trang này. Thử lại, nếu vẫn lỗi hãy báo Phòng Đào tạo kèm mã lỗi bên dưới.",
  code,
  onRetry,
  homeHref,
  homeLabel = "Về trang tổng quan",
}: ErrorStateProps) {
  return (
    <Card role="alert">
      <Result
        icon={<Illustration name="error" className="mx-auto w-44" />}
        title={<h1 className="text-xl font-semibold">{title}</h1>}
        subTitle={
          <span className="flex flex-col items-center gap-1">
            {description}
            {code && <span className="text-xs text-muted">Mã lỗi: {code}</span>}
          </span>
        }
        extra={
          <span className="flex flex-wrap justify-center gap-2">
            {onRetry && (
              <Button type="primary" onClick={onRetry}>
                Thử lại
              </Button>
            )}
            {homeHref && <Button href={homeHref}>{homeLabel}</Button>}
          </span>
        }
      />
    </Card>
  );
}
