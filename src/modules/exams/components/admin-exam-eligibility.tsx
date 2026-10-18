"use client";

import { useState } from "react";
import { Input, message, Modal, Select, Table, Button, type TableColumnsType } from "antd";
import { Magnifier, UsersCheck } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";

export type EligibilityRow = {
  key: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  sectionCode: string;
  courseName: string;
  absences: number;
  sessions: number;
  ratio: number;
  overrideReason: string | null;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function AdminExamEligibility({ rows: initialRows, limitPercent }: { rows: EligibilityRow[]; limitPercent: number }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string>();
  const [target, setTarget] = useState<EligibilityRow | null>(null);
  const [reason, setReason] = useState("");
  const sections = [...new Set(rows.map((row) => row.sectionCode))].sort();
  const visible = rows.filter(
    (row) => (!section || row.sectionCode === section) && (!query.trim() || normalize(`${row.fullName} ${row.studentCode} ${row.sectionCode}`).includes(normalize(query.trim()))),
  );

  const allow = () => {
    if (!target) return;
    if (!reason.trim()) {
      messageApi.warning("Ghi lý do cho dự thi, ví dụ số hiệu giấy xác nhận nằm viện");
      return;
    }
    setRows((current) => current.map((row) => (row.key === target.key ? { ...row, overrideReason: reason.trim() } : row)));
    messageApi.success(`Đã cho ${target.fullName} dự thi ${target.sectionCode}, giảng viên và sinh viên nhận thông báo`);
    setTarget(null);
    setReason("");
  };

  const columns: TableColumnsType<EligibilityRow> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 230,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.fullName}</span>
          <span className="truncate text-xs text-muted">
            <span className="font-mono">{row.studentCode}</span> · {row.className}
          </span>
        </span>
      ),
    },
    {
      title: "Lớp học phần",
      key: "section",
      width: 250,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-xs">{row.sectionCode}</span>
          <span className="truncate">{row.courseName}</span>
        </span>
      ),
    },
    {
      title: "Số buổi vắng",
      key: "absences",
      width: 150,
      sorter: (a, b) => a.ratio - b.ratio,
      render: (_, row) => (
        <span className="tabular-nums">
          {row.absences}/{row.sessions} buổi, <span className="text-rose-700">{Math.round(row.ratio * 100)}%</span>
        </span>
      ),
    },
    {
      title: "Kết quả",
      key: "result",
      width: 280,
      render: (_, row) =>
        row.overrideReason ? (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status={{ label: "Được dự thi", tone: "success" }} />
            <span className="text-xs text-pretty text-muted">{row.overrideReason}</span>
          </span>
        ) : (
          <StatusTag status={{ label: "Cấm thi", tone: "danger" }} />
        ),
    },
    {
      title: "",
      key: "actions",
      width: 120,
      align: "right",
      render: (_, row) =>
        row.overrideReason ? null : (
          <Button size="small" onClick={() => setTarget(row)}>
            Cho dự thi
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap gap-2">
        <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Tên, mã sinh viên, mã lớp" aria-label="Tìm" className="w-full sm:w-64" />
        <Select allowClear showSearch={{ optionFilterProp: "label" }} value={section} onChange={setSection} placeholder="Mọi lớp học phần" aria-label="Lớp học phần" options={sections.map((value) => ({ value, label: value }))} className="w-full sm:w-52" />
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={visible}
        scroll={{ x: 1050 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showTotal: (total) => `${total} trường hợp` }}
        locale={{ emptyText: <EmptyState icon={UsersCheck} title="Không có sinh viên bị cấm thi" description={`Không sinh viên nào vắng từ ${limitPercent}% số buổi trở lên.`} /> }}
      />
      <Modal
        open={target !== null}
        onCancel={() => setTarget(null)}
        title={target ? `Cho ${target.fullName} dự thi ${target.sectionCode}` : ""}
        okText="Cho dự thi"
        cancelText="Hủy"
        onOk={allow}
        mask={{ closable: false }}
        destroyOnHidden
        width={480}
      >
        <p className="mb-3 text-sm text-pretty text-muted">Chỉ áp dụng khi có minh chứng vắng hợp lệ. Lý do được lưu vào nhật ký thao tác.</p>
        <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={300} showCount aria-label="Lý do" />
      </Modal>
    </div>
  );
}
