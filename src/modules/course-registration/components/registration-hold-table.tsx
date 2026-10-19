"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Drawer, Form, Input, message, Modal, Segmented, Select, Switch, Table, type TableColumnsType } from "antd";
import { LockOpen, Magnifier, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { HOLD_KIND_LABEL, HOLD_KIND_OPTIONS } from "../course-registration.constant";
import type { HoldKind, RegistrationHold } from "../course-registration.type";

export type HoldStudentOption = {
  id: string;
  code: string;
  fullName: string;
  className: string;
  faculty: string;
};

type View = "active" | "released";

type HoldFormValues = {
  studentId: string;
  kind: HoldKind;
  blocking: boolean;
  reason: string;
  resolveHint: string;
};

const BLOCKING: StatusMeta = { label: "Chặn đăng ký", tone: "danger" };
const WARNING: StatusMeta = { label: "Chỉ nhắc nhở", tone: "warning" };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

type RegistrationHoldTableProps = {
  holds: RegistrationHold[];
  students: HoldStudentOption[];
  actorName: string;
  studentHrefBase: string;
};

export function RegistrationHoldTable({ holds, students, actorName, studentHrefBase }: RegistrationHoldTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(holds);
  const [view, setView] = useState<View>("active");
  const [kind, setKind] = useState<HoldKind>();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [releasing, setReleasing] = useState<RegistrationHold | null>(null);
  const [releaseNote, setReleaseNote] = useState("");
  const [form] = Form.useForm<HoldFormValues>();

  const active = rows.filter((row) => !row.releasedAt);
  const needle = normalize(query.trim());
  const visible = rows.filter(
    (row) =>
      (view === "active" ? !row.releasedAt : Boolean(row.releasedAt)) &&
      (!kind || row.kind === kind) &&
      (!needle || normalize(`${row.studentName} ${row.studentCode} ${row.className} ${row.reason}`).includes(needle)),
  );

  const create = (values: HoldFormValues) => {
    const student = students.find((entry) => entry.id === values.studentId)!;
    const hold: RegistrationHold = {
      id: `khoa-moi-${dayjs().valueOf()}`,
      studentId: student.id,
      studentCode: student.code,
      studentName: student.fullName,
      className: student.className,
      faculty: student.faculty,
      kind: values.kind,
      blocking: values.blocking,
      reason: values.reason,
      resolveHint: values.resolveHint,
      createdAt: dayjs().toISOString(),
      createdBy: actorName,
      releasedAt: null,
      releasedBy: null,
    };
    setRows((current) => [hold, ...current]);
    setIsCreating(false);
    form.resetFields();
    messageApi.success(
      values.blocking
        ? `Đã khóa đăng ký của ${student.fullName}. Sinh viên thấy lý do và cách gỡ trên trang đăng ký học phần.`
        : `Đã thêm lưu ý cho ${student.fullName}, sinh viên vẫn đăng ký được.`,
    );
  };

  const release = () => {
    if (!releasing) return;
    if (!releaseNote.trim()) {
      messageApi.warning("Ghi căn cứ gỡ khóa, ví dụ số biên lai học phí hoặc tên giấy tờ đã nhận");
      return;
    }
    setRows((current) =>
      current.map((row) =>
        row.id === releasing.id ? { ...row, releasedAt: dayjs().toISOString(), releasedBy: `${actorName}: ${releaseNote.trim()}` } : row,
      ),
    );
    messageApi.success(`Đã gỡ khóa cho ${releasing.studentName}, sinh viên đăng ký được ngay`);
    setReleasing(null);
    setReleaseNote("");
  };

  const columns: TableColumnsType<RegistrationHold> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <Link href={`${studentHrefBase}${row.studentId}`} className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.studentName}</span>
          <span className="text-xs text-muted">
            <span className="font-mono">{row.studentCode}</span> · {row.className}
          </span>
        </Link>
      ),
    },
    { title: "Loại", dataIndex: "kind", width: 150, render: (value: HoldKind) => HOLD_KIND_LABEL[value] },
    { title: "Mức", key: "blocking", width: 140, render: (_, row) => <StatusTag status={row.blocking ? BLOCKING : WARNING} /> },
    {
      title: "Lý do và cách gỡ",
      key: "reason",
      width: 360,
      render: (_, row) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-pretty">{row.reason}</span>
          <span className="text-xs text-pretty text-muted">{row.resolveHint}</span>
        </span>
      ),
    },
    {
      title: view === "active" ? "Người tạo" : "Đã gỡ",
      key: "meta",
      width: 220,
      render: (_, row) =>
        view === "active" ? (
          <span className="flex flex-col text-xs text-muted">
            <span>{row.createdBy}</span>
            <span className="tabular-nums">{formatDate(row.createdAt)}</span>
          </span>
        ) : (
          <span className="flex flex-col text-xs text-muted">
            <span className="text-pretty">{row.releasedBy}</span>
            <span className="tabular-nums">{row.releasedAt ? formatDateTime(row.releasedAt) : ""}</span>
          </span>
        ),
    },
    {
      title: "",
      key: "actions",
      width: 110,
      render: (_, row) =>
        row.releasedAt ? null : (
          <Button size="small" icon={<LockOpen size={14} aria-hidden />} onClick={() => setReleasing(row)}>
            Gỡ khóa
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {contextHolder}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: `Đang áp dụng (${active.length})` },
            { value: "released", label: `Đã gỡ (${rows.length - active.length})` },
          ]}
        />
        <Input
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Magnifier size={16} aria-hidden className="text-muted" />}
          placeholder="Tên, mã sinh viên, lý do"
          aria-label="Tìm"
          className="w-full sm:w-64"
        />
        <Select allowClear value={kind} onChange={setKind} placeholder="Mọi loại" aria-label="Loại khóa" options={HOLD_KIND_OPTIONS} className="w-full sm:w-48" />
        <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setIsCreating(true)} className="sm:ml-auto">
          Thêm khóa đăng ký
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={visible}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{
          emptyText: (
            <EmptyState
              icon={LockOpen}
              title={view === "active" ? "Không có sinh viên nào bị khóa" : "Chưa gỡ khóa nào"}
              description={view === "active" ? "Sinh viên nợ học phí quá hạn được khóa tự động theo dữ liệu của Phòng Kế hoạch - Tài chính." : undefined}
            />
          ),
        }}
      />

      <Drawer
        open={isCreating}
        onClose={() => setIsCreating(false)}
        size={520}
        destroyOnHidden
        mask={{ closable: false }}
        title="Thêm khóa đăng ký"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsCreating(false)}>Hủy</Button>
            <Button type="primary" onClick={() => form.submit()}>
              Lưu
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ kind: "documents", blocking: true }} onFinish={create}>
          <Form.Item name="studentId" label="Sinh viên" rules={[{ required: true, message: "Chưa chọn sinh viên" }]}>
            <Select
              showSearch={{ optionFilterProp: "label" }}
              options={students.map((student) => ({ value: student.id, label: `${student.code} ${student.fullName} (${student.className})` }))}
            />
          </Form.Item>
          <Form.Item name="kind" label="Loại" rules={[{ required: true, message: "Chưa chọn loại" }]}>
            <Select options={HOLD_KIND_OPTIONS} />
          </Form.Item>
          <Form.Item name="blocking" label="Chặn đăng ký học phần" valuePropName="checked" extra="Tắt nếu chỉ muốn nhắc sinh viên mà vẫn cho đăng ký.">
            <Switch />
          </Form.Item>
          <Form.Item name="reason" label="Lý do sinh viên sẽ thấy" rules={[{ required: true, whitespace: true, message: "Chưa nhập lý do" }]}>
            <Input.TextArea autoSize={{ minRows: 2 }} maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="resolveHint" label="Cách gỡ khóa" rules={[{ required: true, whitespace: true, message: "Chưa hướng dẫn cách gỡ" }]}>
            <Input.TextArea autoSize={{ minRows: 2 }} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={releasing !== null}
        title={releasing ? `Gỡ khóa đăng ký cho ${releasing.studentName}?` : ""}
        okText="Gỡ khóa"
        cancelText="Hủy"
        onOk={release}
        onCancel={() => {
          setReleasing(null);
          setReleaseNote("");
        }}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <p className="mb-3 text-sm text-pretty text-muted">{releasing?.reason}</p>
        <Input.TextArea
          value={releaseNote}
          onChange={(event) => setReleaseNote(event.target.value)}
          autoSize={{ minRows: 2 }}
          placeholder="Căn cứ gỡ khóa"
          aria-label="Căn cứ gỡ khóa"
        />
      </Modal>
    </div>
  );
}
