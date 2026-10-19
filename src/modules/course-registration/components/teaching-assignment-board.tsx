"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@bprogress/next/app";
import { Input, message, Segmented, Select, Table, Tabs, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { meetingText } from "@/modules/course-registration/course-registration.constant";
import type { ClassSectionView } from "@/modules/course-registration/course-registration.type";
import { computeWorkloads, lecturerClash, loadStateOf, type AssignableLecturer, type LoadState, type WorkloadRow } from "@/modules/course-registration/teaching-assignment.rule";
import { paginationItemRender, TABS_MORE } from "@/shared/constants/antd.constant";

const LOAD_STATE: Record<LoadState, StatusMeta> = {
  over: { label: "Vượt định mức", tone: "danger" },
  balanced: { label: "Trong định mức", tone: "neutral" },
  under: { label: "Dưới 50% định mức", tone: "warning" },
  none: { label: "Chưa có lớp", tone: "neutral" },
};

type TeachingAssignmentBoardProps = {
  sections: ClassSectionView[];
  lecturers: AssignableLecturer[];
  terms: { id: string; name: string }[];
  termId: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function TeachingAssignmentBoard({ sections, lecturers, terms, termId }: TeachingAssignmentBoardProps) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(sections);
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [load, setLoad] = useState<LoadState>();
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const workloads = useMemo(() => computeWorkloads(rows, lecturers), [rows, lecturers]);
  const faculties = useMemo(() => [...new Set(lecturers.map((lecturer) => lecturer.faculty))], [lecturers]);
  const unassigned = rows.filter((section) => !section.lecturerId && section.status !== "cancelled").length;

  const assign = (section: ClassSectionView, lecturerId: string | null) => {
    if (lecturerId) {
      const clash = lecturerClash(section, lecturerId, rows);
      if (clash) {
        const name = lecturers.find((lecturer) => lecturer.id === lecturerId)?.displayName;
        messageApi.error(`${name} đã dạy ${clash.code} cùng giờ với ${section.code}. Chọn giảng viên khác hoặc đổi lịch lớp trước.`);
        return;
      }
    }
    const lecturer = lecturers.find((entry) => entry.id === lecturerId) ?? null;
    setRows((current) => current.map((entry) => (entry.id === section.id ? { ...entry, lecturerId, lecturerName: lecturer?.displayName ?? null } : entry)));
    messageApi.success(lecturer ? `Đã phân công ${lecturer.displayName} dạy ${section.code}` : `Đã bỏ phân công lớp ${section.code}`);
  };

  const visibleWorkloads = workloads.filter(
    (row) =>
      (!faculty || row.faculty === faculty) &&
      (!load || loadStateOf(row) === load) &&
      (!query.trim() || normalize(row.displayName).includes(normalize(query.trim()))),
  );
  const visibleSections = rows.filter(
    (section) =>
      section.status !== "cancelled" &&
      (!faculty || section.faculty === faculty) &&
      (!onlyUnassigned || !section.lecturerId) &&
      (!query.trim() || normalize(`${section.code} ${section.courseName} ${section.lecturerName ?? ""}`).includes(normalize(query.trim()))),
  );

  const workloadColumns: TableColumnsType<WorkloadRow> = [
    {
      title: "Giảng viên",
      key: "lecturer",
      width: 180,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.displayName}</span>
          <span className="truncate text-xs text-muted">{row.faculty}</span>
        </span>
      ),
    },
    {
      title: "Lớp phụ trách",
      key: "sections",
      width: 240,
      responsive: ["lg"],
      render: (_, row) =>
        row.sections.length === 0 ? (
          <span className="text-muted">Chưa có</span>
        ) : (
          <span className="flex flex-wrap gap-x-2 text-xs">{row.sections.map((section) => <span key={section.id}>{section.code}</span>)}</span>
        ),
    },
    { title: <span className="whitespace-nowrap">Tiết/tuần</span>, dataIndex: "periodsPerWeek", width: 110, align: "right", responsive: ["md"], sorter: (a, b) => a.periodsPerWeek - b.periodsPerWeek, render: (value: number) => <span className="tabular-nums">{value}</span> },
    {
      title: "Giờ chuẩn / định mức",
      key: "hours",
      width: 170,
      sorter: (a, b) => a.ratio - b.ratio,
      render: (_, row) => {
        const state = loadStateOf(row);
        return (
          <span className="flex items-center gap-2">
            <MeterBar value={row.standardHours} max={row.normHours} tone={state === "over" ? "danger" : state === "under" ? "warning" : "primary"} label={`Giờ chuẩn của ${row.displayName}`} />
            <span className="shrink-0 text-xs tabular-nums">
              {row.standardHours}/{row.normHours}
            </span>
          </span>
        );
      },
    },
    {
      title: "Đánh giá",
      key: "state",
      width: 140,
      responsive: ["md"],
      render: (_, row) => {
        const state = loadStateOf(row);
        return state === "balanced" ? <span className="text-muted">Trong định mức</span> : <StatusTag status={LOAD_STATE[state]} />;
      },
    },
    { title: "", key: "leave", width: 100, responsive: ["md"], render: (_, row) => (row.status === "on-leave" ? <StatusTag status={{ label: "Nghỉ phép", tone: "warning" }} /> : null) },
  ];

  const lecturerSelect = (section: ClassSectionView) => {
    const options = [...lecturers]
      .toSorted((a, b) => Number(b.faculty === section.faculty) - Number(a.faculty === section.faculty))
      .map((lecturer) => ({
        value: lecturer.id,
        disabled: lecturer.status === "on-leave",
        label: `${lecturer.displayName}${lecturer.faculty === section.faculty ? "" : ` (${lecturer.faculty})`}`,
      }));
    return (
      <Select
        allowClear
        showSearch={{ optionFilterProp: "label" }}
        value={section.lecturerId ?? undefined}
        placeholder="Chưa phân công"
        status={section.lecturerId ? undefined : "warning"}
        onChange={(value?: string) => assign(section, value ?? null)}
        options={options}
        aria-label={`Giảng viên lớp ${section.code}`}
        className="w-full min-w-44"
      />
    );
  };

  const sectionColumns: TableColumnsType<ClassSectionView> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 240,
      render: (_, section) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs">{section.code}</span>
          <span className="truncate">{section.courseName}</span>
          <span className="mt-2 md:hidden">{lecturerSelect(section)}</span>
        </span>
      ),
    },
    { title: "Lịch học", key: "schedule", width: 240, responsive: ["md"], render: (_, section) => <span className="text-xs text-muted">{section.meetings.map(meetingText).join("; ")}</span> },
    { title: "Sĩ số", key: "size", width: 90, align: "right", responsive: ["md"], render: (_, section) => <span className="tabular-nums">{section.enrolled}/{section.capacity}</span> },
    {
      title: "Giảng viên",
      key: "lecturer",
      width: 280,
      responsive: ["md"],
      render: (_, section) => lecturerSelect(section),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={termId}
          onChange={(value: string) => router.push(`/administrator/teaching-assignments?term=${value}`)}
          aria-label="Học kỳ"
          options={terms.map((term) => ({ value: term.id, label: term.name }))}
          className="w-full sm:w-80"
        />
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Giảng viên, mã lớp, học phần" aria-label="Tìm" className="w-full sm:w-64" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="w-full sm:w-60" />
      </div>
      <Tabs
        more={TABS_MORE}
        items={[
          {
            key: "workload",
            label: "Khối lượng giảng viên",
            children: (
              <div className="flex flex-col gap-3">
                <Select allowClear value={load} onChange={setLoad} placeholder="Mọi mức tải" aria-label="Mức tải" options={(Object.keys(LOAD_STATE) as LoadState[]).map((value) => ({ value, label: LOAD_STATE[value].label }))} className="w-full sm:w-56" />
                <Table
                  rowKey="id"
                  size="small"
                  columns={workloadColumns}
                  dataSource={visibleWorkloads}
                  scroll={{ x: "max-content" }}
                  pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true }}
                  locale={{ emptyText: <EmptyState illustration="search" title="Không có giảng viên khớp bộ lọc" /> }}
                />
              </div>
            ),
          },
          {
            key: "sections",
            label: `Phân công lớp${unassigned > 0 ? ` (${unassigned} chưa có giảng viên)` : ""}`,
            children: (
              <div className="flex flex-col gap-3">
                <Segmented
                  value={onlyUnassigned ? "unassigned" : "all"}
                  onChange={(value) => setOnlyUnassigned(value === "unassigned")}
                  options={[
                    { value: "all", label: "Tất cả lớp" },
                    { value: "unassigned", label: "Chưa có giảng viên" },
                  ]}
                  className="w-fit max-w-full"
                />
                <Table
                  rowKey="id"
                  size="small"
                  columns={sectionColumns}
                  dataSource={visibleSections}
                  scroll={{ x: "max-content" }}
                  pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true }}
                  locale={{ emptyText: <EmptyState illustration="search" title={onlyUnassigned ? "Mọi lớp đã có giảng viên" : "Không có lớp khớp bộ lọc"} /> }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
