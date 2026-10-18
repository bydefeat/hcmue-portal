"use client";

import { ErrorState } from "@/shared/components/ui/error-state";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorState onRetry={retry} />;
}
