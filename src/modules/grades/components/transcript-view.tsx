"use client";

import { Collapse, Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { formatPoint } from "../grades.constant";
import type { TranscriptCourse, TranscriptTerm } from "../grades.type";

const COLUMNS: TableColumnsType<TranscriptCourse> = [
  { title: "Mã HP", dataIndex: "courseCode", width: 110, render: (code: string) => <span className="text-xs">{code}</span> },
  { title: "Tên học phần", dataIndex: "courseName", render: (name: string) => <span className="text-pretty">{name}</span> },
  { title: "TC", dataIndex: "credits", width: 56, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: "Thang 10",
    dataIndex: "score10",
    width: 88,
    align: "right",
    render: (value: number | null) => <span className="tabular-nums">{formatPoint(value, 1)}</span>,
  },
  {
    title: "Điểm chữ",
    dataIndex: "letter",
    width: 88,
    align: "center",
    render: (letter: string | null) => (
      <span className={`font-medium tabular-nums ${letter === "F" ? "text-rose-700" : ""}`}>{letter ?? ""}</span>
    ),
  },
  {
    title: "Thang 4",
    dataIndex: "point4",
    width: 80,
    align: "right",
    render: (value: number | null) => <span className="tabular-nums">{formatPoint(value, 1)}</span>,
  },
];

function TermSummary({ term }: { term: TranscriptTerm }) {
  if (term.isInProgress) {
    return <span className="text-xs text-muted tabular-nums">Đang học · {term.attemptedCredits} tín chỉ</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
      <span>
        ĐTB <span className="font-medium text-foreground">{formatPoint(term.gpa4)}</span>
      </span>
      <span>
        CPA <span className="font-medium text-foreground">{formatPoint(term.cpa4)}</span>
      </span>
      <span>
        Đạt {term.earnedCredits}/{term.attemptedCredits} TC
      </span>
    </span>
  );
}

export function TranscriptView({ terms }: { terms: TranscriptTerm[] }) {
  if (terms.length === 0) {
    return <EmptyState title="Chưa có kết quả học tập" description="Sinh viên chưa hoàn thành học kỳ nào." />;
  }
  const ordered = [...terms].reverse();
  const defaultOpen = ordered.find((term) => !term.isInProgress)?.termId;

  return (
    <Collapse
      defaultActiveKey={defaultOpen ? [defaultOpen] : []}
      items={ordered.map((term) => ({
        key: term.termId,
        label: (
          <span className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-4">
            <span className="font-medium">{term.termName}</span>
            <TermSummary term={term} />
          </span>
        ),
        children: (
          <Table
            rowKey="courseCode"
            size="small"
            columns={COLUMNS}
            dataSource={term.courses}
            pagination={false}
            scroll={{ x: 560 }}
            locale={{ emptyText: <EmptyState title="Không có học phần" /> }}
          />
        ),
      }))}
    />
  );
}
