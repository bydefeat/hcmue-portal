"use client";

import { Table, type TableColumnsType } from "antd";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { SectionCard } from "@/shared/components/ui/section-card";
import { formatDate } from "@/shared/libs/date.lib";
import type { Syllabus, SyllabusAssessment, SyllabusWeek } from "@/modules/teaching/teaching.type";

const ASSESSMENT_COLUMNS: TableColumnsType<SyllabusAssessment> = [
  { title: "Hình thức", dataIndex: "label", width: 180, render: (value: string) => <span className="font-medium">{value}</span> },
  { title: "Trọng số", dataIndex: "weight", width: 96, align: "right", render: (value: number) => <span className="tabular-nums">{value}%</span> },
  { title: "Cách đánh giá", dataIndex: "method", render: (value: string) => <span className="text-muted">{value}</span> },
  { title: "Chuẩn đầu ra", dataIndex: "outcomes", width: 140, render: (value: string[]) => <span className="text-xs">{value.join(", ")}</span> },
];

const WEEK_COLUMNS: TableColumnsType<SyllabusWeek> = [
  { title: "Tuần", dataIndex: "week", width: 64, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  { title: "Nội dung", dataIndex: "topic", width: 280 },
  { title: "Hoạt động", dataIndex: "activities", width: 240, render: (value: string) => <span className="text-muted">{value}</span> },
  { title: "Tài liệu đọc", dataIndex: "readings", width: 200, render: (value: string) => <span className="text-muted">{value}</span> },
];

export function SyllabusView({ syllabus }: { syllabus: Syllabus | null }) {
  if (!syllabus) {
    return (
      <SectionCard title="Đề cương" flush>
        <EmptyState illustration="document" title="Giảng viên chưa công bố đề cương" description="Mục tiêu, kế hoạch từng tuần và cách tính điểm sẽ hiện ở đây khi giảng viên công bố." />
      </SectionCard>
    );
  }
  const weeks = syllabus.weeks.filter((week) => week.topic.trim());
  const total = syllabus.assessments.reduce((sum, item) => sum + item.weight, 0);
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Mục tiêu và chuẩn đầu ra"
        extra={syllabus.publishedAt ? <span className="text-xs text-muted">Công bố {formatDate(syllabus.publishedAt)}</span> : undefined}
      >
        <div className="flex flex-col gap-3">
          {syllabus.description && <p className="max-w-prose text-sm text-pretty">{syllabus.description}</p>}
          {syllabus.outcomes.length === 0 ? (
            <p className="text-sm text-muted">Đề cương chưa ghi chuẩn đầu ra.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {syllabus.outcomes.map((outcome) => (
                <li key={outcome.code} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 text-xs text-muted">{outcome.code}</span>
                  <span className="min-w-0 text-pretty">{outcome.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Đánh giá" extra={<span className="text-sm text-muted tabular-nums">Tổng {total}%</span>} flush>
        <Table rowKey="key" size="small" columns={ASSESSMENT_COLUMNS} dataSource={syllabus.assessments} pagination={false} className="hidden md:block" />
        <ul className="flex flex-col divide-y divide-border-strong md:hidden">
          {syllabus.assessments.map((item) => (
            <li key={item.key} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 font-medium">{item.label}</span>
                <span className="shrink-0 tabular-nums">{item.weight}%</span>
              </span>
              {item.method && <span className="text-xs text-muted">{item.method}</span>}
              {item.outcomes.length > 0 && <span className="text-xs text-muted">{item.outcomes.join(", ")}</span>}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={`Kế hoạch ${syllabus.weeks.length} tuần`} flush>
        {weeks.length === 0 ? (
          <EmptyState illustration="calendar" title="Đề cương chưa có kế hoạch từng tuần" />
        ) : (
          <>
            <Table rowKey="week" size="small" columns={WEEK_COLUMNS} dataSource={weeks} pagination={false} scroll={{ x: 784 }} className="hidden md:block" />
            <ol className="flex flex-col divide-y divide-border-strong md:hidden">
              {weeks.map((week) => (
                <li key={week.week} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="w-14 shrink-0 text-xs text-muted tabular-nums">Tuần {week.week}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-pretty">{week.topic}</span>
                    {week.activities && <span className="text-xs text-muted">{week.activities}</span>}
                    {week.readings && <span className="text-xs text-muted">Đọc: {week.readings}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </SectionCard>

      {syllabus.references.length > 0 && (
        <SectionCard title="Tài liệu tham khảo">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            {syllabus.references.map((reference) => (
              <li key={reference} className="text-pretty">
                {reference}
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}
