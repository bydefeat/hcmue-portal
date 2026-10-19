"use client";

import { useState } from "react";
import { Button, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { CircleCheck, CircleXmark, Magnifier, TableDownload } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { GRADUATION_STATUS } from "../graduation.constant";
import type { GraduationCandidate, GraduationStatus } from "../graduation.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function GraduationReview({ candidates }: { candidates: GraduationCandidate[] }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(candidates);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GraduationStatus>();
  const [faculty, setFaculty] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const faculties = [...new Set(rows.map((row) => row.faculty))];
  const visible = rows.filter(
    (row) =>
      (!status || row.status === status) &&
      (!faculty || row.faculty === faculty) &&
      (!query.trim() || normalize(`${row.fullName} ${row.code} ${row.className}`).includes(normalize(query.trim()))),
  );
  const chosen = rows.filter((row) => selected.includes(row.studentId) && row.status === "eligible");

  const approve = () =>
    modal.confirm({
      title: `Trình hội đồng công nhận ${chosen.length} sinh viên?`,
      content: "Hệ thống lập dự thảo quyết định công nhận tốt nghiệp cho từng sinh viên ở mục Quyết định sinh viên. Danh sách không sửa được sau khi hội đồng công nhận.",
      okText: "Công nhận",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        const ids = chosen.map((row) => row.studentId);
        setRows((current) => current.map((row) => (ids.includes(row.studentId) ? { ...row, status: "approved" } : row)));
        setSelected([]);
        messageApi.success(`Hội đồng đã công nhận ${ids.length} sinh viên, đã lập ${ids.length} dự thảo quyết định`);
      },
    });

  const columns: TableColumnsType<GraduationCandidate> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">
            {row.code} · {row.className}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted tabular-nums md:hidden">
            <StatusTag status={GRADUATION_STATUS[row.status]} />
            {row.earnedCredits}/{row.requiredCredits} tín chỉ
          </span>
        </span>
      ),
    },
    { title: "Ngành", dataIndex: "majorName", width: 160, responsive: ["lg"] },
    {
      title: <span className="whitespace-nowrap">Tín chỉ</span>,
      key: "credits",
      width: 96,
      responsive: ["md"],
      align: "right",
      render: (_, row) => (
        <span className={`tabular-nums ${row.earnedCredits < row.requiredCredits ? "text-rose-700" : ""}`}>
          {row.earnedCredits}/{row.requiredCredits}
        </span>
      ),
    },
    { title: "CPA", dataIndex: "cpa4", width: 70, align: "right", responsive: ["md"], render: (value: number) => <span className="tabular-nums">{value.toFixed(2).replace(".", ",")}</span> },
    { title: "Xếp loại", dataIndex: "classification", width: 110, responsive: ["xl"] },
    {
      title: "Điều kiện chưa đạt",
      key: "missing",
      width: 220,
      responsive: ["md"],
      render: (_, row) => {
        const failed = row.checks.filter((check) => !check.passed);
        return failed.length === 0 ? <span className="text-muted">Không có</span> : <span className="text-xs text-pretty text-rose-700">{failed.map((check) => check.label).join(", ")}</span>;
      },
    },
    { title: "Trạng thái", dataIndex: "status", width: 150, responsive: ["md"], render: (value: GraduationStatus) => <StatusTag status={GRADUATION_STATUS[value]} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      {modalContextHolder}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã, lớp" aria-label="Tìm sinh viên" className="col-span-2 w-full sm:w-56" />
        <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={Object.entries(GRADUATION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-52" />
        <Select allowClear value={faculty} onChange={setFaculty} placeholder="Mọi khoa" aria-label="Khoa" options={faculties.map((value) => ({ value, label: value }))} className="min-w-0 sm:w-56" />
        <div className="col-span-2 flex flex-wrap gap-2 sm:ml-auto">
          <Button icon={<TableDownload size={16} aria-hidden className="text-zinc-500" />} onClick={() => messageApi.success(`Đã xuất ${visible.length} dòng ra tệp Excel theo mẫu của Bộ`)}>
            Xuất danh sách
          </Button>
          <Button type="primary" disabled={chosen.length === 0} onClick={approve}>
            Trình hội đồng {chosen.length > 0 ? `(${chosen.length})` : ""}
          </Button>
        </div>
      </div>
      <Table
        rowKey="studentId"
        size="small"
        columns={columns}
        dataSource={visible}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), getCheckboxProps: (row) => ({ disabled: row.status !== "eligible" }) }}
        expandable={{
          expandedRowRender: (row) => (
            <ul className="grid gap-2 py-1 sm:grid-cols-2 lg:grid-cols-4">
              {row.checks.map((check) => (
                <li key={check.key} className="flex items-start gap-2 text-sm">
                  {check.passed ? <CircleCheck size={16} aria-label="Đạt" className="mt-0.5 shrink-0 text-green-700" /> : <CircleXmark size={16} aria-label="Chưa đạt" className="mt-0.5 shrink-0 text-rose-700" />}
                  <span className="flex flex-col">
                    <span className="font-medium">{check.label}</span>
                    <span className="text-xs text-muted">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ),
        }}
        scroll={{ x: "max-content" }}
        pagination={{ itemRender: paginationItemRender, pageSize: 25, hideOnSinglePage: true, showTotal: (total) => `${total} sinh viên` }}
        locale={{ emptyText: <EmptyState illustration="document" title="Không có sinh viên ở trạng thái này" /> }}
      />
    </div>
  );
}
