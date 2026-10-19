"use client";

import { useState, useTransition } from "react";
import { Button, Input, message, Select, Table, type TableColumnsType } from "antd";
import { Magnifier } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { formatDateTime } from "@/shared/libs/date.lib";
import { normalizeSearch } from "@/shared/libs/search.lib";
import { remindUnregisteredStudents } from "@/modules/course-registration/course-registration.action";
import type { UnregisteredStudent } from "@/modules/course-registration/course-registration.type";

export function RegistrationMonitorStudents({ students }: { students: UnregisteredStudent[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [query, setQuery] = useState("");
  const [cohort, setCohort] = useState<number>();
  const [faculty, setFaculty] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [remindedAt, setRemindedAt] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.flatMap((student) => (student.remindedAt ? [[student.id, student.remindedAt]] : []))),
  );
  const [isSending, startSending] = useTransition();
  const cohorts = [...new Set(students.map((student) => student.cohort))].toSorted();
  const faculties = [...new Set(students.map((student) => student.faculty))];
  const visible = students.filter(
    (student) =>
      (!cohort || student.cohort === cohort) &&
      (!faculty || student.faculty === faculty) &&
      (!query.trim() || normalizeSearch(`${student.fullName} ${student.code} ${student.className}`).includes(normalizeSearch(query.trim()))),
  );

  const remind = (ids: string[]) =>
    startSending(async () => {
      const result = await remindUnregisteredStudents(ids).catch(() => null);
      if (!result) {
        messageApi.error("Chưa gửi được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        return;
      }
      const { remindedIds, withoutAccount } = result.data;
      setRemindedAt((current) => ({ ...current, ...Object.fromEntries(remindedIds.map((id) => [id, result.data.remindedAt])) }));
      setSelected([]);
      messageApi.success(
        `Đã gửi thông báo nhắc đăng ký tới ${remindedIds.length} sinh viên${withoutAccount > 0 ? `; ${withoutAccount} sinh viên chưa kích hoạt tài khoản cổng nên chưa nhận được` : ""}`,
      );
    });

  const columns: TableColumnsType<UnregisteredStudent> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 180,
      render: (_, student) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{student.fullName}</span>
          <span className="text-xs text-muted">
            {student.code}
            <span className="md:hidden"> · {student.className}</span>
          </span>
        </span>
      ),
    },
    { title: "Lớp", dataIndex: "className", width: 130, responsive: ["md"], render: (value: string) => <span className="text-xs">{value}</span> },
    { title: "Khoa", dataIndex: "faculty", width: 200, responsive: ["md"] },
    {
      title: "Nhắc",
      key: "reminded",
      width: 120,
      render: (_, student) =>
        remindedAt[student.id] ? (
          <span className="text-xs text-green-700" title={`Nhắc lúc ${formatDateTime(remindedAt[student.id])}`}>
            Đã nhắc
          </span>
        ) : student.hasAccount ? (
          <span className="text-xs text-muted">Chưa nhắc</span>
        ) : (
          <span className="text-xs text-muted">Chưa có tài khoản</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã, lớp" aria-label="Tìm sinh viên" className="col-span-2 w-full sm:w-56" />
        <Select allowClear value={cohort} onChange={setCohort} placeholder="Mọi khóa" aria-label="Khóa" options={cohorts.map((value) => ({ value, label: `Khóa ${value}` }))} className="min-w-0 sm:w-32" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="min-w-0 sm:w-56" />
        <div className="col-span-2 flex flex-wrap gap-2 sm:ml-auto">
          <Button disabled={selected.length === 0} loading={isSending} onClick={() => remind(selected)}>
            Gửi nhắc {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
          <Button disabled={visible.length === 0 || isSending} onClick={() => remind(visible.map((student) => student.id))}>
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
        scroll={{ x: "max-content" }}
        pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{ emptyText: <EmptyState illustration="done" title="Mọi sinh viên trong đợt đã đăng ký" /> }}
      />
    </div>
  );
}
