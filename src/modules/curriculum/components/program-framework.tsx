"use client";

import { Table, type TableColumnsType } from "antd";
import { BookOpen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { COURSE_TYPE_LABEL, KNOWLEDGE_BLOCK_LABEL } from "../curriculum.constant";
import type { Course, CourseType, ProgramDetail } from "../curriculum.type";
import { SectionCard } from "@/shared/components/ui/section-card";

const COLUMNS: TableColumnsType<Course> = [
  { title: "Mã HP", dataIndex: "code", width: 110, render: (code: string) => <span className="text-xs">{code}</span> },
  { title: "Tên học phần", dataIndex: "name", render: (name: string) => <span className="text-pretty">{name}</span> },
  { title: "TC", dataIndex: "credits", width: 56, align: "right", render: (value: number) => <span className="tabular-nums">{value}</span> },
  {
    title: "LT/TH",
    key: "split",
    width: 72,
    align: "right",
    render: (_, row) => (
      <span className="text-muted tabular-nums">
        {row.theoryCredits}/{row.practiceCredits}
      </span>
    ),
  },
  { title: "Loại", dataIndex: "type", width: 96, render: (value: CourseType) => COURSE_TYPE_LABEL[value] },
  {
    title: "Tiên quyết",
    dataIndex: "prerequisiteCodes",
    width: 180,
    render: (codes: string[]) =>
      codes.length > 0 ? <span className="text-xs">{codes.join(", ")}</span> : <span className="text-muted">Không</span>,
  },
];

export function ProgramFramework({ program }: { program: ProgramDetail }) {
  if (program.semesters.length === 0) {
    return (
      <SectionCard flush>
        <EmptyState
          icon={BookOpen}
          title="Chưa có khung chương trình"
          description="Chương trình này chưa được gán học phần theo học kỳ. Sinh viên các khóa áp dụng sẽ chưa thấy tiến độ đào tạo."
        />
      </SectionCard>
    );
  }

  const missing = program.totalCredits - program.plannedCredits;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        {program.semesters.map((semester) => (
          <section key={semester.semester} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Học kỳ {semester.semester}</h2>
              <span className="text-sm text-muted tabular-nums">
                {semester.courses.length} học phần · {semester.credits} tín chỉ
              </span>
            </div>
            <Table rowKey="code" size="small" columns={COLUMNS} dataSource={semester.courses} pagination={false} scroll={{ x: 640 }} />
          </section>
        ))}
      </div>
      <SectionCard className="lg:sticky lg:top-20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tín chỉ đã xếp vào khung</span>
            <span className="text-xl font-semibold tabular-nums">
              {program.plannedCredits}/{program.totalCredits}
            </span>
            <MeterBar value={program.plannedCredits} max={program.totalCredits} label="Tín chỉ đã xếp" />
            {missing > 0 && (
              <span className="text-xs text-pretty text-amber-700">Còn thiếu {missing} tín chỉ so với tổng của chương trình.</span>
            )}
          </div>
          <ul className="flex flex-col gap-3">
            {program.creditsByBlock.map((entry) => (
              <li key={entry.block} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2 text-sm">
                  {KNOWLEDGE_BLOCK_LABEL[entry.block]}
                  <span className="tabular-nums">{entry.credits} TC</span>
                </span>
                <MeterBar value={entry.credits} max={program.plannedCredits} label={KNOWLEDGE_BLOCK_LABEL[entry.block]} />
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
