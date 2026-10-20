"use client";

import { useState } from "react";
import { useRouter } from "@bprogress/next/app";
import { Button, Checkbox, Input, message, Select, Table, Tooltip, type TableColumnsType } from "antd";
import { AlertWarning, Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { MeterBar } from "@/shared/components/ui/meter-bar";
import { StatusTag } from "@/shared/components/ui/status-tag";
import {
  CLASS_FULL_STATUS,
  CLASS_SECTION_STATUS,
  CLASS_SECTION_STATUS_OPTIONS,
  audienceText,
  meetingText,
  reservedText,
} from "@/modules/course-registration/course-registration.constant";
import { saveClassSection } from "@/modules/course-registration/course-registration.action";
import type { ClassSectionFormValues, ClassSectionStatus, ClassSectionView, Term } from "@/modules/course-registration/course-registration.type";
import { ClassSectionFormDrawer, type SectionCourseOption, type SectionLecturerOption, type SectionRoomOption } from "@/modules/course-registration/components/class-section-form-drawer";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

type ClassSectionTableProps = {
  sections: ClassSectionView[];
  terms: Term[];
  termId: string;
  initialQuery?: string;
  courses: SectionCourseOption[];
  lecturers: SectionLecturerOption[];
  rooms: SectionRoomOption[];
  majors: { code: string; name: string }[];
  cohorts: number[];
  header: { title: string; description?: React.ReactNode };
};

const statusOf = (row: ClassSectionView) =>
  row.status === "open" && row.isFull ? (
    <StatusTag status={CLASS_FULL_STATUS} />
  ) : row.status === "open" ? (
    <span className="text-xs text-muted">{CLASS_SECTION_STATUS.open.label}</span>
  ) : (
    <StatusTag status={CLASS_SECTION_STATUS[row.status]} />
  );

export function ClassSectionTable({ sections, terms, termId, initialQuery = "", courses, lecturers, rooms, majors, cohorts, header }: ClassSectionTableProps) {
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
  const faculties = [...new Set(rows.map((row) => row.faculty))].toSorted((a, b) => a.localeCompare(b, "vi"));
  const needle = normalizeSearch(query.trim());
  const filtered = rows.filter((row) => {
    if (needle && !normalizeSearch(`${row.code} ${row.courseName} ${row.lecturerName ?? ""}`).includes(needle)) return false;
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

  const submit = async (values: ClassSectionFormValues) => {
    const result = await saveClassSection(termId, editing?.id ?? null, { ...values, lecturerId: values.lecturerId ?? null }).catch(() => null);
    if (!result) {
      messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
      return undefined;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return result.fieldErrors;
    }
    // Xung đột do server tính lại trên cả học kỳ (mọi khoa), không tự tính trên danh sách đã lọc theo khoa.
    setRows(result.data.sections);
    setIsOpen(false);
    const saved = result.data.saved;
    messageApi.success(saved.status === "cancelled" ? `Đã hủy lớp ${saved.code}` : editing ? `Đã lưu lớp ${saved.code}` : `Đã mở lớp ${saved.code}`);
    return undefined;
  };

  const columns: TableColumnsType<ClassSectionView> = [
    {
      title: "Lớp học phần",
      key: "section",
      width: 250,
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-medium">{row.code}</span>
          <span className="text-pretty">{row.courseName}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted md:hidden">
            {statusOf(row)}
            <span className="tabular-nums">
              {row.enrolled}/{row.capacity} chỗ
            </span>
            <span>{row.lecturerName ?? "Chưa phân công"}</span>
            {row.conflicts.length > 0 && <span className="font-medium text-rose-700">{row.conflicts.length} xung đột</span>}
          </span>
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
      responsive: ["md"],
      align: "right",
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: "Giảng viên",
      dataIndex: "lecturerName",
      width: 180,
      responsive: ["md"],
      render: (value: string | null) => (value ? value : <span className="text-amber-700">Chưa phân công</span>),
    },
    {
      title: "Lịch học",
      key: "meetings",
      width: 220,
      responsive: ["md"],
      render: (_, row) => (
        <ul className="flex flex-col gap-0.5 text-xs">
          {row.meetings.map((meeting) => (
            <li key={`${meeting.dayOfWeek}-${meeting.startPeriod}`}>{meetingText(meeting)}</li>
          ))}
          {row.labGroups.map((group) => (
            <li key={group.id} className="text-muted tabular-nums">
              {group.code.split(".").at(-1)} {meetingText(group.meeting)} · {group.enrolled}/{group.capacity}
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: "Sĩ số",
      key: "enrolled",
      width: 120,
      responsive: ["md"],
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
      width: 120,
      responsive: ["md"],
      render: (_, row) => statusOf(row),
    },
    {
      title: "Xung đột",
      dataIndex: "conflicts",
      width: 110,
      responsive: ["md"],
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
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="text" icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => openForm(row)} aria-label={`Sửa ${row.code}`}>
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <PageHeader
        {...header}
        actions={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => openForm(null)}>
            Mở lớp
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
          <Select
            value={termId}
            onChange={(value: string) => router.push(`/administrator/class-sections?term=${value}`)}
            aria-label="Học kỳ"
            options={terms.map((entry) => ({ value: entry.id, label: entry.name }))}
            className="col-span-2 w-full sm:w-72"
          />
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Mã lớp, học phần hoặc giảng viên"
            aria-label="Tìm lớp học phần"
            className="col-span-2 w-full sm:w-72"
          />
          <Select
            allowClear
            value={faculty}
            onChange={setFaculty}
            placeholder="Mọi khoa"
            aria-label="Khoa"
            options={faculties.map((value) => ({ value, label: value }))}
            className="min-w-0 sm:w-56"
          />
          <Select
            allowClear
            value={status}
            onChange={setStatus}
            placeholder="Mọi trạng thái"
            aria-label="Trạng thái"
            options={CLASS_SECTION_STATUS_OPTIONS}
            className="min-w-0 sm:w-40"
          />
          <Checkbox checked={onlyConflicts} onChange={(event) => setOnlyConflicts(event.target.checked)} className="col-span-2">
            Chỉ lớp có xung đột
          </Checkbox>
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
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} lớp` }}
          locale={{
            emptyText: (
              <EmptyState
                illustration="search"
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
          rooms={rooms}
          majors={majors}
          cohorts={cohorts}
          onClose={() => setIsOpen(false)}
          onSubmit={submit}
        />
      </div>
    </>
  );
}
