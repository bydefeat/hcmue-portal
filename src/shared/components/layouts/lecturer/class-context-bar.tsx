"use client";

import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { usePathname } from "next/navigation";
import { Tabs } from "antd";
import { ChevronLeft } from "defeat-icons-react";
import { TABS_MORE } from "@/shared/constants/antd.constant";

export type ClassContext = {
  id: string;
  code: string;
  courseName: string;
  credits: number;
  enrolled: number;
  capacity: number;
  scheduleText: string;
  termLabel: string;
};

const TABS = [
  { key: "roster", label: "Danh sách lớp" },
  { key: "attendance", label: "Điểm danh" },
  { key: "grading", label: "Nhập điểm" },
  { key: "syllabus", label: "Đề cương" },
  { key: "announcements", label: "Thông báo lớp" },
];

export function ClassContextBar({ classContext }: { classContext: ClassContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const baseHref = `/lecturer/classes/${classContext.id}`;
  const activeKey = TABS.find((tab) => pathname.startsWith(`${baseHref}/${tab.key}`))?.key ?? "roster";

  return (
    <div className="mb-4 sm:mb-6">
      <div>
        <Link
          href="/lecturer/classes"
          className="flex w-fit items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft size={14} aria-hidden />
          Lớp học phần
        </Link>
        <div className="mt-1 flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-4">
          <h1 className="min-w-0 text-xl font-semibold text-pretty">
            {classContext.courseName} <span className="text-base font-medium text-muted">{classContext.code}</span>
          </h1>
          <p className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span className="tabular-nums">
              Sĩ số <span className="font-medium text-foreground">{classContext.enrolled}</span>/{classContext.capacity}
            </span>
            <span className="tabular-nums">{classContext.credits} tín chỉ</span>
            {classContext.termLabel}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">{classContext.scheduleText}</p>
        <Tabs
          more={TABS_MORE}
          activeKey={activeKey}
          items={TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
          onChange={(key) => router.push(key === "roster" ? baseHref : `${baseHref}/${key}`)}
          className="mt-2"
          classNames={{ header: "mb-0" }}
        />
      </div>
    </div>
  );
}
