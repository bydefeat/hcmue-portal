"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, Input, Segmented, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { SectionSurveyResult, SurveyQuestion } from "@/modules/surveys/surveys.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { LOW_SCORE } from "@/modules/surveys/surveys.constant";

type View = "section" | "lecturer" | "faculty";

type GroupRow = { key: string; label: string; sublabel: string; sections: number; responses: number; enrolled: number; overall: number };

function score(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function groupBy(results: SectionSurveyResult[], keyOf: (row: SectionSurveyResult) => string, labelOf: (row: SectionSurveyResult) => [string, string]): GroupRow[] {
  const map = new Map<string, SectionSurveyResult[]>();
  for (const row of results) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row]);
  return [...map].map(([key, rows]) => {
    const responses = rows.reduce((sum, row) => sum + row.responses, 0);
    const [label, sublabel] = labelOf(rows[0]);
    return {
      key,
      label,
      sublabel,
      sections: rows.length,
      responses,
      enrolled: rows.reduce((sum, row) => sum + row.enrolled, 0),
      overall: responses > 0 ? rows.reduce((sum, row) => sum + row.overall * row.responses, 0) / responses : 0,
    };
  });
}

function ScoreCell({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <MeterBar value={value} max={5} tone={value < LOW_SCORE ? "danger" : "primary"} label="Điểm trung bình trên 5" />
      <span className={`shrink-0 text-xs tabular-nums ${value < LOW_SCORE ? "font-medium text-rose-700" : ""}`}>{score(value)}</span>
    </span>
  );
}

export function AdminSurveyResults({ results, questions }: { results: SectionSurveyResult[]; questions: SurveyQuestion[] }) {
  const [view, setView] = useState<View>("section");
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const faculties = [...new Set(results.map((row) => row.faculty))];
  const filtered = results.filter(
    (row) => (!faculty || row.faculty === faculty) && (!query.trim() || normalizeSearch(`${row.classCode} ${row.courseName} ${row.lecturerName ?? ""}`).includes(normalizeSearch(query.trim()))),
  );
  const opened = results.find((row) => row.classSectionId === openId) ?? null;
  const groups = useMemo(
    () =>
      view === "lecturer"
        ? groupBy(filtered, (row) => row.lecturerId ?? "none", (row) => [row.lecturerName ?? "Chưa phân công", row.faculty])
        : groupBy(filtered, (row) => row.faculty, (row) => [row.faculty, ""]),
    [filtered, view],
  );

  const sectionColumns: TableColumnsType<SectionSurveyResult> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 220,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => setOpenId(row.classSectionId)} className="h-auto max-w-full flex-col items-start gap-0 p-0 text-left">
          <span className="text-xs">{row.classCode}</span>
          <span className="max-w-full truncate text-foreground">{row.courseName}</span>
        </Button>
      ),
    },
    { title: "Giảng viên", dataIndex: "lecturerName", width: 180, responsive: ["lg"], render: (value: string | null) => value ?? <span className="text-muted">Chưa phân công</span> },
    {
      title: "Phản hồi",
      key: "responses",
      width: 130,
      responsive: ["md"],
      sorter: (a, b) => a.responses / a.enrolled - b.responses / b.enrolled,
      render: (_, row) => (
        <span className="tabular-nums">
          {row.responses}/{row.enrolled} <span className="text-xs text-muted">({Math.round((row.responses / row.enrolled) * 100)}%)</span>
        </span>
      ),
    },
    { title: <span className="whitespace-nowrap">Điểm chung</span>, dataIndex: "overall", width: 150, sorter: (a, b) => a.overall - b.overall, render: (value: number) => <ScoreCell value={value} /> },
    {
      title: "",
      key: "flag",
      width: 150,
      responsive: ["md"],
      render: (_, row) => (row.overall < LOW_SCORE ? <StatusTag status={{ label: "Dưới ngưỡng 3,5", tone: "danger" }} /> : null),
    },
  ];

  const groupColumns: TableColumnsType<GroupRow> = [
    {
      title: view === "lecturer" ? "Giảng viên" : "Khoa",
      key: "label",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.label}</span>
          {row.sublabel && <span className="truncate text-xs text-muted">{row.sublabel}</span>}
        </span>
      ),
    },
    { title: <span className="whitespace-nowrap">Số lớp</span>, dataIndex: "sections", width: 90, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{value}</span> },
    { title: <span className="whitespace-nowrap">Tỉ lệ phản hồi</span>, key: "rate", width: 140, align: "right", responsive: ["md"], render: (_, row) => <span className="tabular-nums">{Math.round((row.responses / row.enrolled) * 100)}%</span> },
    { title: <span className="whitespace-nowrap">Điểm chung</span>, dataIndex: "overall", width: 150, sorter: (a, b) => a.overall - b.overall, defaultSortOrder: "ascend", render: (value: number) => <ScoreCell value={value} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          className="w-fit max-w-full"
          value={view}
          onChange={setView}
          options={[
            { value: "section", label: "Theo lớp" },
            { value: "lecturer", label: "Theo giảng viên" },
            { value: "faculty", label: "Theo khoa" },
          ]}
        />
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Lớp, học phần, giảng viên" aria-label="Tìm" className="w-full sm:w-60" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="w-full sm:w-56" />
      </div>
      {view === "section" ? (
        <Table
          rowKey="classSectionId"
          size="small"
          columns={sectionColumns}
          dataSource={filtered}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState illustration="document" title="Chưa có kết quả khảo sát" /> }}
        />
      ) : (
        <Table
          rowKey="key"
          size="small"
          columns={groupColumns}
          dataSource={groups}
          scroll={{ x: "max-content" }}
          pagination={false}
          locale={{ emptyText: <EmptyState illustration="document" title="Chưa có kết quả khảo sát" /> }}
        />
      )}
      <Drawer open={opened !== null} onClose={() => setOpenId(null)} size={560} destroyOnHidden title={opened ? `Khảo sát lớp ${opened.classCode}` : ""}>
        {opened && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{opened.courseName}</span>
              <span className="text-sm text-muted">
                {opened.lecturerName ?? "Chưa phân công"} · <span className="tabular-nums">{opened.responses}/{opened.enrolled}</span> sinh viên trả lời
              </span>
            </div>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Điểm từng câu (thang 5)</h3>
              <ul className="flex flex-col gap-3">
                {questions.map((question) => (
                  <li key={question.id} className="flex flex-col gap-1">
                    <span className="text-sm text-pretty">{question.text}</span>
                    <ScoreCell value={opened.averages[question.id] ?? 0} />
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Ý kiến của sinh viên</h3>
              <ul className="flex flex-col gap-2">
                {opened.comments.map((comment) => (
                  <li key={comment} className="rounded-lg bg-background px-3 py-2 text-sm text-pretty">
                    {comment}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
