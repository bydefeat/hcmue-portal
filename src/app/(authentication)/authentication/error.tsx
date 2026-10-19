"use client";

import { ErrorState, errorDigest } from "@/shared/components/ui/error-state";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState code={errorDigest(error)} onRetry={retry} homeHref="/authentication/sign-in" homeLabel="Về trang đăng nhập" />;
}
