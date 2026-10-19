"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, Dropdown, Input, message, Select, Table, type TableColumnsType } from "antd";
import { FileArrowIn, Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { cohortOptions, facultiesOf, facultyOptions, STUDENT_STATUS, STUDENT_STATUS_OPTIONS, withNextCohort } from "@/modules/users/users.constant";
import type { MajorRef, Student, StudentFormValues, StudentStatus } from "@/modules/users/users.type";
import { StudentFormDrawer } from "@/modules/users/components/student-form-drawer";
import { StudentImportModal } from "@/modules/users/components/student-import-modal";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { importStudents, saveStudent, setStudentsStatus } from "@/modules/users/users.action";

export type StudentRow = Student & {
  cpa4: number | null;
  standingLabel: string | null;
};

const NETWORK_ERROR = "Chưa lưu được, kiểm tra kết nối rồi thử lại.";

type StudentTableProps = {
  students: StudentRow[];
  // Danh mục ngành (trong phạm vi người xem) và các khóa đang có lớp, page đọc từ DB.
  majors: MajorRef[];
  cohorts: number[];
  header: { title: string; description?: React.ReactNode };
};

export function StudentTable({ students, majors, cohorts, header }: StudentTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(students);
  const [query, setQuery] = useState("");
  const [faculty, setFaculty] = useState<string>();
  const [cohort, setCohort] = useState<number>();
  const [status, setStatus] = useState<StudentStatus>();
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const facultyFilterOptions = useMemo(() => facultyOptions(facultiesOf(majors)), [majors]);
  const cohortFilterOptions = useMemo(() => cohortOptions(cohorts), [cohorts]);
  // Thêm mới hoặc nhập file được chọn cả khóa kế tiếp (tân sinh viên chưa có lớp).
  const enrollableCohorts = useMemo(() => withNextCohort(cohorts), [cohorts]);
  const importCatalog = useMemo(() => ({ majorCodes: majors.map((major) => major.code), cohorts: enrollableCohorts }), [majors, enrollableCohorts]);
  const classes = useMemo(
    () => [...new Map(rows.map((row) => [row.className, { code: row.className, majorCode: row.majorCode, cohort: row.cohort }])).values()],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query.trim());
    return rows.filter((row) => {
      if (needle && !normalizeSearch(`${row.fullName} ${row.code} ${row.className}`).includes(needle)) return false;
      if (faculty && row.faculty !== faculty) return false;
      if (cohort && row.cohort !== cohort) return false;
      if (status && row.status !== status) return false;
      return true;
    });
  }, [rows, query, faculty, cohort, status]);

  const openCreate = () => {
    setEditing(null);
    setIsDrawerOpen(true);
  };

  const openEdit = (row: StudentRow) => {
    setEditing(row);
    setIsDrawerOpen(true);
  };

  const handleSubmit = async (values: StudentFormValues) => {
    const result = await saveStudent(editing?.id ?? null, values).catch(() => null);
    if (!result) {
      messageApi.error(NETWORK_ERROR);
      return undefined;
    }
    if (!result.ok) {
      messageApi.error(result.message);
      return result.fieldErrors;
    }
    const saved: StudentRow = { ...result.data, cpa4: editing?.cpa4 ?? null, standingLabel: editing?.standingLabel ?? null };
    setRows((current) => (editing ? current.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...current]));
    messageApi.success(editing ? `Đã lưu hồ sơ ${saved.fullName}` : `Đã thêm ${saved.fullName} vào lớp ${saved.className}`);
    setIsDrawerOpen(false);
    return undefined;
  };

  const changeStatus = (next: StudentStatus) =>
    startSaving(async () => {
      const ids = selectedIds.map(String);
      const result = await setStudentsStatus(ids, next).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      const chosen = new Set(ids);
      setRows((current) => current.map((row) => (chosen.has(row.id) ? { ...row, status: next } : row)));
      messageApi.success(`Đã chuyển ${result.data.updated} sinh viên sang "${STUDENT_STATUS[next].label}"`);
      setSelectedIds([]);
    });

  const columns: TableColumnsType<StudentRow> = [
    {
      title: "Mã SV",
      dataIndex: "code",
      width: 120,
      responsive: ["md"],
      render: (code: string) => <span className="text-xs">{code}</span>,
    },
    {
      title: "Họ và tên",
      key: "name",
      width: 240,
      render: (_, row) => (
        <Link href={`/administrator/users/students/${row.code}`} className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">{row.email}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted md:hidden">
            {row.code} · {row.className}
            {row.status !== "studying" && <StatusTag status={STUDENT_STATUS[row.status]} />}
          </span>
        </Link>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, responsive: ["md"], render: (value: string) => <span className="text-xs">{value}</span> },
    { title: "Ngành", dataIndex: "majorName", width: 190, responsive: ["md"] },
    {
      title: "CPA",
      dataIndex: "cpa4",
      width: 130,
      responsive: ["sm"],
      align: "right",
      sorter: (a, b) => (a.cpa4 ?? -1) - (b.cpa4 ?? -1),
      render: (value: number | null, row) =>
        value === null ? (
          <span className="text-xs text-muted">Chưa có</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className="tabular-nums">{value.toFixed(2).replace(".", ",")}</span>
            <span className="text-xs text-muted">{row.standingLabel}</span>
          </span>
        ),
    },
    {
      title: "Tình trạng",
      dataIndex: "status",
      width: 140,
      responsive: ["md"],
      render: (value: StudentStatus) => (value === "studying" ? <span className="text-muted">Đang học</span> : <StatusTag status={STUDENT_STATUS[value]} />),
    },
    {
      title: "",
      key: "actions",
      width: 80,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="text" aria-label={`Sửa ${row.fullName}`} icon={<Pen size={14} aria-hidden className="text-zinc-500" />} onClick={() => openEdit(row)}>
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
          <>
            <Button icon={<FileArrowIn size={16} aria-hidden className="text-zinc-500" />} onClick={() => setIsImportOpen(true)}>
              Nhập từ Excel
            </Button>
            <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
              Thêm sinh viên
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Tên, mã sinh viên hoặc lớp"
            aria-label="Tìm sinh viên"
            className="col-span-2 w-full sm:w-72"
          />
          <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={facultyFilterOptions} className="col-span-2 w-full sm:w-60" />
          <Select allowClear value={cohort} onChange={setCohort} placeholder="Mọi khóa" aria-label="Khóa" options={cohortFilterOptions} className="min-w-0 sm:w-36" />
          <Select
            allowClear
            value={status}
            onChange={setStatus}
            placeholder="Mọi tình trạng"
            aria-label="Tình trạng"
            options={STUDENT_STATUS_OPTIONS}
            className="min-w-0 sm:w-44"
          />
        </div>

        {selectedIds.length > 0 && (
          <Card size="small" classNames={{ body: "flex flex-wrap items-center gap-3 py-2" }}>
            <span className="text-sm tabular-nums">Đã chọn {selectedIds.length} sinh viên</span>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: STUDENT_STATUS_OPTIONS.map((option) => ({ key: option.value, label: option.label })),
                onClick: ({ key }) => changeStatus(key as StudentStatus),
              }}
            >
              <Button size="small" loading={isSaving}>
                Đổi trạng thái
              </Button>
            </Dropdown>
            <Button size="small" type="text" onClick={() => setSelectedIds([])}>
              Bỏ chọn
            </Button>
          </Card>
        )}

        <Table
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={filtered}
          rowSelection={{ selectedRowKeys: selectedIds, onChange: setSelectedIds }}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} sinh viên` }}
          locale={{
            emptyText: (
              <EmptyState
                illustration="search"
                title="Không có sinh viên khớp bộ lọc"
                description="Thử tìm theo mã sinh viên hoặc bỏ bớt điều kiện lọc."
              />
            ),
          }}
        />

        <StudentFormDrawer
          open={isDrawerOpen}
          student={editing}
          majors={majors}
          cohorts={enrollableCohorts}
          classes={classes}
          onClose={() => setIsDrawerOpen(false)}
          onSubmit={handleSubmit}
        />

        <StudentImportModal
          open={isImportOpen}
          existingCodes={rows.map((row) => row.code)}
          catalog={importCatalog}
          onClose={() => setIsImportOpen(false)}
          onImport={async (values) => {
            const result = await importStudents(values).catch(() => null);
            if (!result?.ok) {
              messageApi.error(result?.message ?? NETWORK_ERROR);
              return false;
            }
            setRows((current) => [...result.data.map((student) => ({ ...student, cpa4: null, standingLabel: null })), ...current]);
            messageApi.success(`Đã nhập ${result.data.length} sinh viên mới`);
            return true;
          }}
        />
      </div>
    </>
  );
}
