"use client";

import { useState } from "react";
import { Button, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier, UsersCheck } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";

export type PendingStudent = {
  id: string;
  code: string;
  fullName: string;
  className: string;
  cohort: number;
  faculty: string;
  email: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function RegistrationMonitorStudents({ students }: { students: PendingStudent[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [query, setQuery] = useState("");
  const [cohort, setCohort] = useState<number>();
  const [faculty, setFaculty] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [reminded, setReminded] = useState<string[]>([]);
  const cohorts = [...new Set(students.map((student) => student.cohort))].sort();
  const faculties = [...new Set(students.map((student) => student.faculty))];
  const visible = students.filter(
    (student) =>
      (!cohort || student.cohort === cohort) &&
      (!faculty || student.faculty === faculty) &&
      (!query.trim() || normalize(`${student.fullName} ${student.code} ${student.className}`).includes(normalize(query.trim()))),
  );

  const remind = (ids: string[]) => {
    setReminded((current) => [...new Set([...current, ...ids])]);
    setSelected([]);
    messageApi.success(`Đã gửi email và thông báo nhắc đăng ký tới ${ids.length} sinh viên`);
  };

  const columns: TableColumnsType<PendingStudent> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 240,
      render: (_, student) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{student.fullName}</span>
          <span className="font-mono text-xs text-muted">{student.code}</span>
        </span>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, render: (value: string) => <span className="font-mono text-xs">{value}</span> },
    { title: "Khoa", dataIndex: "faculty", width: 200 },
    { title: "Nhắc", key: "reminded", width: 120, render: (_, student) => (reminded.includes(student.id) ? <span className="text-xs text-green-700">Đã nhắc</span> : <span className="text-xs text-muted">Chưa nhắc</span>) },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap gap-2">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã, lớp" aria-label="Tìm sinh viên" className="w-full sm:w-56" />
        <Select allowClear value={cohort} onChange={setCohort} placeholder="Mọi khóa" aria-label="Khóa" options={cohorts.map((value) => ({ value, label: `Khóa ${value}` }))} className="min-w-0 flex-1 sm:w-32 sm:flex-none" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
        <div className="flex gap-2 sm:ml-auto">
          <Button disabled={selected.length === 0} onClick={() => remind(selected)}>
            Gửi nhắc {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
          <Button disabled={visible.length === 0} onClick={() => remind(visible.map((student) => student.id))}>
            Nhắc tất cả đang lọc
          </Button>
        </div>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={visible}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        scroll={{ x: 760 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{ emptyText: <EmptyState icon={UsersCheck} title="Mọi sinh viên trong đợt đã đăng ký" /> }}
      />
    </div>
  );
}
