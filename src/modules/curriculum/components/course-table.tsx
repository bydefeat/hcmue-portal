"use client";

import { useState } from "react";
import { Button, Input, message, Select, Table, Tag, type TableColumnsType } from "antd";
import { Books, Magnifier, Pen, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { COURSE_TYPE_LABEL, COURSE_TYPE_OPTIONS, KNOWLEDGE_BLOCK_LABEL, KNOWLEDGE_BLOCK_OPTIONS } from "../curriculum.constant";
import type { Course, CourseFormValues, CourseType, KnowledgeBlock } from "../curriculum.type";
import { CourseFormDrawer } from "./course-form-drawer";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function CourseTable({
  courses,
  initialQuery = "",
  header,
}: {
  courses: Course[];
  initialQuery?: string;
  header: { title: string; description?: React.ReactNode };
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(courses);
  const [query, setQuery] = useState(initialQuery);
  const [faculty, setFaculty] = useState<string>();
  const [type, setType] = useState<CourseType>();
  const [block, setBlock] = useState<KnowledgeBlock>();
  const [editing, setEditing] = useState<Course | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const faculties = [...new Set(rows.map((course) => course.faculty))].sort((a, b) => a.localeCompare(b, "vi"));
  const nameByCode = new Map(rows.map((course) => [course.code, course.name]));
  const needle = normalize(query.trim());
  const filtered = rows.filter((row) => {
    if (needle && !normalize(`${row.code} ${row.name}`).includes(needle)) return false;
    if (faculty && row.faculty !== faculty) return false;
    if (type && row.type !== type) return false;
    if (block && row.block !== block) return false;
    return true;
  });

  const openForm = (course: Course | null) => {
    setEditing(course);
    setIsOpen(true);
  };

  const submit = (values: CourseFormValues) => {
    if (editing) {
      setRows((current) => current.map((row) => (row.id === editing.id ? { ...row, ...values } : row)));
      messageApi.success(`Đã lưu học phần ${values.code}`);
    } else {
      setRows((current) => [{ ...values, id: values.code.toLowerCase(), description: values.description ?? "" }, ...current]);
      messageApi.success(`Đã thêm học phần ${values.code} vào danh mục`);
    }
    setIsOpen(false);
  };

  const columns: TableColumnsType<Course> = [
    {
      title: "Mã HP",
      dataIndex: "code",
      width: 100,
      responsive: ["md"],
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (code: string) => <span className="text-xs">{code}</span>,
    },
    {
      title: "Tên học phần",
      dataIndex: "name",
      width: 240,
      render: (name: string, row) => (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-pretty">{name}</span>
            {!row.isActive && <Tag className="me-0">Ngừng giảng dạy</Tag>}
          </span>
          <span className="text-xs text-muted tabular-nums md:hidden">
            {row.code} · {row.credits} tín chỉ · {COURSE_TYPE_LABEL[row.type]}
          </span>
        </span>
      ),
    },
    {
      title: <span className="whitespace-nowrap">TC</span>,
      dataIndex: "credits",
      width: 72,
      responsive: ["md"],
      align: "right",
      sorter: (a, b) => a.credits - b.credits,
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: <span className="whitespace-nowrap">LT/TH</span>,
      key: "split",
      width: 80,
      responsive: ["xxl"],
      align: "right",
      render: (_, row) => (
        <span className="text-muted tabular-nums">
          {row.theoryCredits}/{row.practiceCredits}
        </span>
      ),
    },
    { title: "Khoa phụ trách", dataIndex: "faculty", width: 170, responsive: ["md"] },
    { title: "Loại", dataIndex: "type", width: 90, responsive: ["md"], render: (value: CourseType) => COURSE_TYPE_LABEL[value] },
    { title: "Khối kiến thức", dataIndex: "block", width: 140, responsive: ["lg"], render: (value: KnowledgeBlock) => KNOWLEDGE_BLOCK_LABEL[value] },
    {
      title: "Ràng buộc",
      key: "requisites",
      width: 200,
      responsive: ["lg"],
      render: (_, course) => {
        const groups = [
          { label: "Tiên quyết", codes: course.prerequisiteCodes },
          { label: "Song hành", codes: course.corequisiteCodes },
          { label: "Tương đương", codes: course.equivalentCodes },
        ].filter((group) => group.codes.length > 0);
        if (groups.length === 0) return <span className="text-muted">Không</span>;
        return (
          <span className="flex flex-col gap-0.5 text-xs">
            {groups.map((group) => (
              <span key={group.label} className="flex flex-wrap gap-x-2">
                <span className="text-muted">{group.label}</span>
                {group.codes.map((code) => (
                  <span key={code} title={nameByCode.get(code)}>
                    {code}
                  </span>
                ))}
              </span>
            ))}
          </span>
        );
      },
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
            Thêm học phần
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
            placeholder="Mã hoặc tên học phần"
            aria-label="Tìm học phần"
            className="col-span-2 w-full sm:w-64"
          />
          <Select
            allowClear
            value={faculty}
            onChange={setFaculty}
            placeholder="Mọi khoa"
            aria-label="Khoa phụ trách"
            options={faculties.map((value) => ({ value, label: value }))}
            className="col-span-2 w-full sm:w-56"
          />
          <Select
            allowClear
            value={type}
            onChange={setType}
            placeholder="Mọi loại"
            aria-label="Loại học phần"
            options={COURSE_TYPE_OPTIONS}
            className="min-w-0 sm:w-36"
          />
          <Select
            allowClear
            value={block}
            onChange={setBlock}
            placeholder="Mọi khối"
            aria-label="Khối kiến thức"
            options={KNOWLEDGE_BLOCK_OPTIONS}
            className="min-w-0 sm:w-48"
          />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} học phần` }}
          locale={{
            emptyText: (
              <EmptyState
                icon={Books}
                title={rows.length === 0 ? "Danh mục học phần trống" : "Không có học phần khớp bộ lọc"}
                description={rows.length === 0 ? "Thêm học phần để xây dựng khung chương trình." : "Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."}
              />
            ),
          }}
        />
        <CourseFormDrawer
          open={isOpen}
          course={editing}
          courses={rows}
          faculties={faculties}
          onClose={() => setIsOpen(false)}
          onSubmit={submit}
        />
      </div>
    </>
  );
}
