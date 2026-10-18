"use client";

import { Skeleton } from "antd";

export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Đang tải" className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton.Input active size="small" className="w-56" />
        <Skeleton.Input active size="small" className="w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton.Input active className="w-64 max-w-full" />
        <Skeleton.Input active className="w-40" />
        <Skeleton.Button active className="ml-auto" />
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} active title={false} paragraph={{ rows: 1, width: "100%" }} className="py-2" />
        ))}
      </div>
    </div>
  );
}
