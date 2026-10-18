"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@bprogress/next/app";
import { AutoComplete, Input } from "antd";
import { Magnifier } from "defeat-icons-react";

export type SearchEntry = {
  group: string;
  label: string;
  description: string;
  keywords: string;
  href: string;
};

const MAX_PER_GROUP = 5;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function GlobalSearch({ entries }: { entries: SearchEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const indexed = useMemo(
    () => entries.map((entry) => ({ entry, haystack: normalize(`${entry.label} ${entry.description} ${entry.keywords}`) })),
    [entries],
  );

  const options = useMemo(() => {
    const needle = normalize(query);
    if (needle.length < 2) return [];
    const groups = new Map<string, SearchEntry[]>();
    for (const { entry, haystack } of indexed) {
      if (!haystack.includes(needle)) continue;
      const list = groups.get(entry.group) ?? [];
      if (list.length < MAX_PER_GROUP) groups.set(entry.group, [...list, entry]);
    }
    return [...groups].map(([group, list]) => ({
      label: group,
      options: list.map((entry) => ({
        value: entry.href,
        label: (
          <span className="flex min-w-0 flex-col py-0.5">
            <span className="truncate font-medium">{entry.label}</span>
            <span className="truncate text-xs text-muted">{entry.description}</span>
          </span>
        ),
      })),
    }));
  }, [indexed, query]);

  return (
    <AutoComplete
      value={query}
      options={options}
      onSearch={setQuery}
      onSelect={(href: string) => {
        setQuery("");
        router.push(href);
      }}
      notFoundContent={normalize(query).length >= 2 ? <span className="text-muted">Không có kết quả cho “{query}”</span> : null}
      popupMatchSelectWidth={420}
      className="w-full max-w-md"
    >
      <Input
        allowClear
        aria-label="Tìm kiếm toàn hệ thống"
        prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
        placeholder="Tìm sinh viên, giảng viên, học phần, lớp"
      />
    </AutoComplete>
  );
}
