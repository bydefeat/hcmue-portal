"use client";

import { useEffect, useState } from "react";
import { Button, DatePicker, Drawer, Form, Input, message, Modal, Select, Table, type TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { Magnifier, Plus, ScrollText } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { DECISION_KIND_LABEL, DECISION_KIND_OPTIONS, DECISION_STATUS } from "../users.constant";
import type { DecisionKind, DecisionStatus, StudentDecision } from "../users.type";
import { DecisionPreview } from "./decision-preview";

export type DecisionStudentOption = { id: string; code: string; fullName: string; className: string; faculty: string };

type DecisionTableProps = {
  decisions: StudentDecision[];
  students: DecisionStudentOption[];
  signerName: string;
  header: { title: string; description?: React.ReactNode };
};

type CreateValues = { studentId: string; kind: DecisionKind; title: string; effectiveDate: Dayjs; basis: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

export function DecisionTable({ decisions, students, signerName, header }: DecisionTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [modal, modalContextHolder] = Modal.useModal();
  const [rows, setRows] = useState(decisions);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DecisionKind>();
  const [status, setStatus] = useState<DecisionStatus>();
  const [creating, setCreating] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [form] = Form.useForm<CreateValues>();
  const preview = rows.find((row) => row.id === previewId) ?? null;

  useEffect(() => {
    if (creating) form.resetFields();
  }, [creating, form]);

  const visible = rows.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (!status || row.status === status) &&
      (!query.trim() || normalize(`${row.studentName} ${row.studentCode} ${row.number ?? ""} ${row.title}`).includes(normalize(query.trim()))),
  );

  const update = (id: string, patch: Partial<StudentDecision>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const submitForSignature = (row: StudentDecision) => {
    update(row.id, { status: "pending-signature", number: `${1300 + rows.length}/QĐ-ĐHSP` });
    messageApi.success(`Đã trình ký quyết định cho ${row.studentName}`);
  };

  const sign = (row: StudentDecision) =>
    modal.confirm({
      title: "Ký quyết định?",
      content: `Quyết định ${row.number} có hiệu lực từ ${formatDate(row.effectiveDate)}. Trạng thái học tập của sinh viên được cập nhật theo quyết định và không sửa được nữa.`,
      okText: "Ký",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        update(row.id, { status: "signed", signedBy: `${signerName}, người ký`, signedAt: dayjs().toISOString() });
        messageApi.success(`Đã ký quyết định ${row.number}`);
      },
    });

  const revoke = (row: StudentDecision) =>
    modal.confirm({
      title: `Thu hồi quyết định ${row.number}?`,
      content: "Quyết định hết hiệu lực, trạng thái của sinh viên trở về như trước khi ký. Cần có quyết định thu hồi kèm theo.",
      okText: "Thu hồi",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: () => {
        update(row.id, { status: "revoked" });
        messageApi.success(`Đã thu hồi quyết định ${row.number}`);
      },
    });

  const create = (values: CreateValues) => {
    const student = students.find((entry) => entry.id === values.studentId)!;
    setRows((current) => [
      {
        id: `qd-moi-${current.length + 1}`,
        number: null,
        kind: values.kind,
        studentId: student.id,
        studentCode: student.code,
        studentName: student.fullName,
        className: student.className,
        faculty: student.faculty,
        title: values.title.trim(),
        effectiveDate: values.effectiveDate.toISOString(),
        signedBy: null,
        signedAt: null,
        status: "draft",
        basis: values.basis.trim(),
      },
      ...current,
    ]);
    setCreating(false);
    messageApi.success(`Đã lập dự thảo quyết định cho ${student.fullName}`);
  };

  const numberLink = (row: StudentDecision) => (
    <Button type="link" size="small" onClick={() => setPreviewId(row.id)} className="h-auto p-0 text-xs">
      {row.number ?? "Xem dự thảo"}
    </Button>
  );

  const columns: TableColumnsType<StudentDecision> = [
    {
      title: "Số quyết định",
      key: "number",
      width: 130,
      responsive: ["md"],
      render: (_, row) => numberLink(row),
    },
    {
      title: "Sinh viên",
      key: "student",
      width: 210,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.studentName}</span>
          <span className="truncate text-xs text-muted">
            {row.studentCode} · {row.className}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden">
            <StatusTag status={DECISION_STATUS[row.status]} />
            {DECISION_KIND_LABEL[row.kind]}
            {numberLink(row)}
          </span>
        </span>
      ),
    },
    { title: "Loại", dataIndex: "kind", width: 160, responsive: ["md"], render: (value: DecisionKind) => DECISION_KIND_LABEL[value] },
    { title: "Nội dung", dataIndex: "title", width: 280, responsive: ["md"], render: (value: string) => <span className="text-pretty">{value}</span> },
    { title: "Hiệu lực", dataIndex: "effectiveDate", width: 100, responsive: ["md"], render: (value: string) => <span className="text-xs tabular-nums">{formatDate(value)}</span> },
    { title: "Trạng thái", dataIndex: "status", width: 130, responsive: ["md"], render: (value: DecisionStatus) => <StatusTag status={DECISION_STATUS[value]} /> },
    {
      title: "",
      key: "actions",
      width: 100,
      align: "right",
      fixed: "right",
      render: (_, row) => (
        <div className="flex justify-end">
          {row.status === "draft" && (
            <Button size="small" type="text" onClick={() => submitForSignature(row)}>
              Trình ký
            </Button>
          )}
          {row.status === "pending-signature" && (
            <Button size="small" type="text" onClick={() => sign(row)}>
              Ký
            </Button>
          )}
          {row.status === "signed" && (
            <Button size="small" type="text" danger onClick={() => revoke(row)}>
              Thu hồi
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <PageHeader
        {...header}
        actions={
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>
            Lập quyết định
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input allowClear value={query} onChange={(event) => setQuery(event.target.value)} prefix={<Magnifier size={16} aria-hidden className="text-muted" />} placeholder="Số quyết định, sinh viên, nội dung" aria-label="Tìm quyết định" className="col-span-2 w-full sm:w-64" />
          <Select allowClear value={kind} onChange={setKind} placeholder="Mọi loại" aria-label="Loại quyết định" options={DECISION_KIND_OPTIONS} className="min-w-0 sm:w-56" />
          <Select allowClear value={status} onChange={setStatus} placeholder="Mọi trạng thái" aria-label="Trạng thái" options={Object.entries(DECISION_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} className="min-w-0 sm:w-40" />
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <EmptyState icon={ScrollText} title="Không có quyết định khớp bộ lọc" /> }}
        />
        <Drawer
          open={creating}
          onClose={() => setCreating(false)}
          size={560}
          mask={{ closable: false }}
          destroyOnHidden
          title="Lập quyết định sinh viên"
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCreating(false)}>Hủy</Button>
              <Button type="primary" onClick={() => form.submit()}>
                Lưu dự thảo
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={create}>
            <Form.Item name="studentId" label="Sinh viên" rules={[{ required: true, message: "Chưa chọn sinh viên" }]}>
              <Select
                showSearch={{ optionFilterProp: "label" }}
                placeholder="Gõ tên hoặc mã sinh viên"
                options={students.map((student) => ({ value: student.id, label: `${student.fullName} ${student.code} ${student.className}` }))}
              />
            </Form.Item>
            <Form.Item name="kind" label="Loại quyết định" rules={[{ required: true, message: "Chưa chọn loại" }]}>
              <Select
                placeholder="Chọn loại quyết định"
                options={DECISION_KIND_OPTIONS}
                onChange={(value: DecisionKind) => {
                  if (!form.getFieldValue("title")) form.setFieldValue("title", DECISION_KIND_LABEL[value]);
                }}
              />
            </Form.Item>
            <Form.Item name="title" label="Nội dung quyết định" rules={[{ required: true, whitespace: true, message: "Chưa nhập nội dung" }]}>
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} showCount />
            </Form.Item>
            <Form.Item name="basis" label="Căn cứ" rules={[{ required: true, whitespace: true, message: "Chưa nhập căn cứ" }]} extra="Ví dụ: đơn của sinh viên, biên bản họp hội đồng">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
            </Form.Item>
            <Form.Item name="effectiveDate" label="Có hiệu lực từ" rules={[{ required: true, message: "Chưa chọn ngày" }]}>
              <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" className="w-full" />
            </Form.Item>
          </Form>
        </Drawer>
        <Modal
          open={preview !== null}
          onCancel={() => setPreviewId(null)}
          title={preview ? `Quyết định ${preview.number ?? "dự thảo"}` : ""}
          width={720}
          destroyOnHidden
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPreviewId(null)}>Đóng</Button>
              <Button onClick={() => window.print()}>In quyết định</Button>
            </div>
          }
        >
          {preview && <DecisionPreview decision={preview} />}
        </Modal>
      </div>
    </>
  );
}
