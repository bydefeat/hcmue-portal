"use client";

import { useRouter } from "@bprogress/next/app";
import { Select } from "antd";

export function HistoryTermSelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <Select
      value={value}
      onChange={(term: string) => router.push(`/application/registration/history?term=${term}`)}
      options={options}
      aria-label="Học kỳ"
      className="w-full sm:w-80"
    />
  );
}
