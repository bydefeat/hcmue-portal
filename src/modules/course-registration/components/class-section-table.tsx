"use client";

import { useState } from "react";
import { useRouter } from "@bprogress/next/app";
import { Button, Checkbox, Input, message, Select, Table, Tooltip, type TableColumnsType } from "antd";
import { AlertWarning, Magnifier, Plus, PresentationScreen } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import {
  CLASS_FULL_STATUS,
  CLASS_SECTION_STATUS,
  CLASS_SECTION_STATUS_OPTIONS,
  audienceText,
  conflictsOf,
  meetingText,
  reservedText,
} from "../course-registration.constant";
import type { ClassSectionFormValues, ClassSectionStatus, ClassSectionView, Term } from "../course-registration.type";
import { ClassSectionFormDrawer, type SectionCourseOption, type SectionLecturerOption } from "./class-section-form-drawer";

type ClassSectionTableProps = {
  sections: ClassSectionView[];
  terms: Term[];
  termId: string;
  initialQuery?: string;
  courses: SectionCourseOption[];
  lecturers: SectionLecturerOption[];
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

function withConflicts(sections: ClassSectionView[]) {
  return sections.map((section) => ({
    ...section,
    isFull: section.enrolled >= section.capacity,
    conflicts: conflictsOf(section, sections),
  }));
}

export function ClassSectionTable({ sections, terms, termId, initialQuery = "", courses, lecturers }: ClassSectionTableProps) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(sections);
  const [query, setQuery] = useState(initialQuery);
  const [faculty, setFaculty] = useState<string>();
  const [status, setStatus] = useState<ClassSectionStatus>();
  const [onlyConflicts, setOnlyConflicts] = useState(false);
  const [editing, setEditing] = useState<ClassSectionView | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const term = terms.find((entry) => entry.id === termId);
  const faculties = [...new Set(rows.map((row) => row.faculty))].sort((a, b) => a.localeCompare(b, "vi"));
  const needle = normalize(query.trim());
  const filtered = rows.filter((row) => {
    if (needle && !normalize(`${row.code} ${row.courseName} ${row.lecturerName ?? ""}`).includes(needle)) return false;
    if (faculty && row.faculty !== faculty) return false;
    if (status && row.status !== status) return false;
    if (onlyConflicts && row.conflicts.length === 0) return false;
    return true;
  });
  const conflictCount = rows.filter((row) => row.conflicts.length > 0).length;
  const unassignedCount = rows.filter((row) => !row.lecturerId && row.status !== "cancelled").length;
  const fullCount = rows.filter((row) => row.isFull && row.status === "open").length;

  const openForm = (section: ClassSectionView | null) => {
    setEditing(section);
    setIsOpen(true);
  };

  const submit = (values: ClassSectionFormValues) => {
    const course = courses.find((entry) => entry.code === values.courseCode);
    const lecturer = lecturers.find((entry) => entry.id === values.lecturerId);
    const code = `${values.courseCode}.${String(values.sectionNumber).padStart(2, "0")}`;
    if (!editing && rows.some((row) => row.code === code)) {
      messageApi.error(`Lớp ${code} đã có trong học kỳ này. Đổi số thứ tự lớp rồi lưu lại.`);
      return;
    }
    const existingLabs = editing?.labGroups ?? [];
    const base = {
      lecturerId: lecturer?.id ?? null,
      lecturerName: lecturer?.displayName ?? null,
      capacity: values.capacity,
      status: values.status,
      meetings: values.meetings,
      minEnrollment: values.minEnrollment,
      audience:
        values.audienceMajors.length > 0 || values.audienceCohorts.length > 0
          ? { majorCodes: values.audienceMajors, cohorts: values.audienceCohorts, note: values.audienceNote ?? "" }
          : null,
      reservedSeats: (values.reservedSeats ?? []).map((seat) => ({
        ...seat,
        majorCodes: seat.majorCodes ?? [],
        cohorts: seat.cohorts ?? [],
        taken: editing?.reservedSeats.find((entry) => entry.label === seat.label)?.taken ?? 0,
      })),
      labGroups: (values.labGroups ?? []).map((group) => {
        const labCode = `${code}.${group.code}`;
        return {
          id: `${termId}-${labCode}`.toLowerCase().replace(/\./g, "-"),
          code: labCode,
          meeting: { dayOfWeek: group.dayOfWeek, startPeriod: group.startPeriod, endPeriod: group.endPeriod, room: group.room },
          capacity: group.capacity,
          enrolled: existingLabs.find((entry) => entry.code === labCode)?.enrolled ?? 0,
        };
      }),
    };
    const next = editing
      ? rows.map((row) => (row.id === editing.id ? { ...row, ...base } : row))
      : [
          {
            ...base,
            id: `${termId}-${code.toLowerCase().replace(".", "-")}`,
            code,
            termId,
            courseCode: values.courseCode,
            courseName: course?.name ?? values.courseCode,
            credits: course?.credits ?? 0,
            faculty: course?.faculty ?? "",
            enrolled: 0,
            startDate: term?.startDate ?? "",
            endDate: term?.endDate ?? "",
            isFull: false,
            conflicts: [],
          },
          ...rows,
        ];
    const recomputed = withConflicts(next);
    setRows(recomputed);
    setIsOpen(false);
    const saved = recomputed.find((row) => row.code === (editing?.code ?? code));
    if (saved && saved.conflicts.length > 0) {
      messageApi.warning(`Đã lưu lớp ${saved.code} nhưng còn ${saved.conflicts.length} xung đột lịch. Xem cột Xung đột để xử lý.`);
    } else {
      messageApi.success(editing ? `Đã lưu lớp ${code}` : `Đã mở lớp ${code}`);
    }
  };

  const columns: TableColumnsType<ClassSectionView> = [
    {
      title: "Lớp học phần",
      key: "section",
      fixed: "left",
      width: 260,
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-xs font-medium">{row.code}</span>
          <span className="text-pretty">{row.courseName}</span>
          {row.audience && <span className="text-xs text-pretty text-amber-700">{audienceText(row.audience)}</span>}
          {row.reservedSeats.map((seat) => (
            <span key={seat.label} className="text-xs text-pretty text-muted tabular-nums">
              {reservedText(seat)}
            </span>
          ))}
        </span>
      ),
    },
    {
      title: "TC",
      dataIndex: "credits",
      width: 56,
      align: "right",
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: "Giảng viên",
      dataIndex: "lecturerName",
      width: 200,
      render: (value: string | null) => (value ? value : <span className="text-amber-700">Chưa phân công</span>),
    },
    {
      title: "Lịch học",
      key: "meetings",
      width: 260,
      render: (_, row) => (
        <ul className="flex flex-col gap-0.5 text-xs">
          {row.meetings.map((meeting) => (
            <li key={`${meeting.dayOfWeek}-${meeting.startPeriod}`}>{meetingText(meeting)}</li>
          ))}
          {row.labGroups.map((group) => (
            <li key={group.id} className="text-muted tabular-nums">
              <span className="font-mono">{group.code.split(".").at(-1)}</span> {meetingText(group.meeting)} · {group.enrolled}/{group.capacity}
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Sĩ số",
      key: "enrolled",
      width: 130,
      sorter: (a, b) => a.enrolled / a.capacity - b.enrolled / b.capacity,
      render: (_, row) => (
        <span className="flex flex-col gap-1">
          <span className="text-xs tabular-nums">
            <span className="font-medium">{row.enrolled}</span>/{row.capacity}
          </span>
          <MeterBar value={row.enrolled} max={row.capacity} tone={row.isFull ? "warning" : "primary"} label={`Sĩ số ${row.code}`} />
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 130,
      render: (_, row) =>
        row.status === "open" && row.isFull ? (
          <StatusTag status={CLASS_FULL_STATUS} />
        ) : row.status === "open" ? (
          <span className="text-xs text-muted">{CLASS_SECTION_STATUS.open.label}</span>
        ) : (
          <StatusTag status={CLASS_SECTION_STATUS[row.status]} />
        ),
    },
    {
      title: "Xung đột",
      dataIndex: "conflicts",
      width: 130,
      render: (conflicts: ClassSectionView["conflicts"]) =>
        conflicts.length > 0 ? (
          <Tooltip
            title={
              <ul className="flex flex-col gap-1">
                {conflicts.map((conflict) => (
                  <li key={`${conflict.kind}-${conflict.withCode}`}>{conflict.message}</li>
                ))}
              </ul>
            }
          >
            <span className="flex w-fit cursor-help items-center gap-1 text-xs font-medium text-rose-700">
              <AlertWarning size={14} aria-hidden />
              {conflicts.length} xung đột
            </span>
          </Tooltip>
        ) : null,
    },
    {
      title: "",
      key: "actions",
      width: 72,
      align: "right",
      render: (_, row) => (
        <Button size="small" type="text" onClick={() => openForm(row)}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={termId}
          onChange={(value: string) => router.push(`/administrator/class-sections?term=${value}`)}
          aria-label="Học kỳ"
          options={terms.map((entry) => ({ value: entry.id, label: entry.name }))}
          className="w-full sm:w-72"
        />
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Mã lớp, học phần hoặc giảng viên"
          aria-label="Tìm lớp học phần"
          className="w-full sm:w-72"
        />
        <Select
          allowClear
          value={faculty}
          onChange={setFaculty}
          placeholder="Mọi khoa"
          aria-label="Khoa"
          options={faculties.map((value) => ({ value, label: value }))}
          className="min-w-0 flex-1 sm:w-56 sm:flex-none"
        />
        <Select
          allowClear
          value={status}
          onChange={setStatus}
          placeholder="Mọi trạng thái"
          aria-label="Trạng thái"
          options={CLASS_SECTION_STATUS_OPTIONS}
          className="min-w-0 flex-1 sm:w-40 sm:flex-none"
        />
        <Checkbox checked={onlyConflicts} onChange={(event) => setOnlyConflicts(event.target.checked)}>
          Chỉ lớp có xung đột
        </Checkbox>
        <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => openForm(null)} className="w-full sm:ml-auto sm:w-auto">
          Mở lớp
        </Button>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted tabular-nums">
        <span>{rows.length} lớp</span>
        {conflictCount > 0 && <span className="text-rose-700">{conflictCount} lớp trùng lịch phòng hoặc giảng viên</span>}
        {unassignedCount > 0 && <span className="text-amber-700">{unassignedCount} lớp chưa có giảng viên</span>}
        {fullCount > 0 && <span>{fullCount} lớp đã đủ chỗ</span>}
      </p>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1250 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} lớp` }}
        locale={{
          emptyText: (
            <EmptyState
              icon={PresentationScreen}
              title={rows.length === 0 ? "Học kỳ này chưa mở lớp nào" : "Không có lớp khớp bộ lọc"}
              description={rows.length === 0 ? "Mở lớp đầu tiên để sinh viên có lớp đăng ký." : "Thử bỏ bớt điều kiện lọc."}
            />
          ),
        }}
      />
      <ClassSectionFormDrawer
        open={isOpen}
        section={editing}
        termName={term?.name ?? ""}
        courses={courses}
        lecturers={lecturers}
        onClose={() => setIsOpen(false)}
        onSubmit={submit}
      />
    </div>
  );
}
