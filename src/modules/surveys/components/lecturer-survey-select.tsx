"use client";

import { useRouter } from "@bprogress/next/app";
import { Select } from "antd";

export function LecturerSurveySelect({ value, options }: { value: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  return (
    <Select
      value={value}
      onChange={(survey: string) => router.push(`/lecturer/workload?survey=${survey}`, { scroll: false })}
      options={options}
      aria-label="Đợt khảo sát"
      className="w-full sm:w-96"
      popupMatchSelectWidth={false}
    />
  );
}
