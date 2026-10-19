"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Drawer, Form, Input, message, Modal, Segmented, Select, Switch, Table, type TableColumnsType } from "antd";
import { LockOpen, Magnifier, Plus } from "defeat-icons-react";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { StatusTag } from "@/shared/components/ui/status-tag";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { formatDate, formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { HOLD_KIND_LABEL, HOLD_KIND_OPTIONS, keepCurrencyTogether } from "@/modules/course-registration/course-registration.constant";
import { createHold, releaseHold } from "@/modules/course-registration/course-registration.action";
import type { HoldKind, RegistrationHold } from "@/modules/course-registration/course-registration.type";
import { paginationItemRender } from "@/shared/constants/antd.constant";
import { normalizeSearch } from "@/shared/libs/search.lib";

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

type RegistrationHoldTableProps = {
  holds: RegistrationHold[];
  students: HoldStudentOption[];
  studentHrefBase: string;
  header: { title: string; description?: React.ReactNode };
};

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

export function RegistrationHoldTable({ holds, students, studentHrefBase, header }: RegistrationHoldTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState(holds);
  const [view, setView] = useState<View>("active");
  const [kind, setKind] = useState<HoldKind>();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [releasing, setReleasing] = useState<RegistrationHold | null>(null);
  const [releaseNote, setReleaseNote] = useState("");
  const [form] = Form.useForm<HoldFormValues>();
  const [isSaving, startSaving] = useTransition();

  const active = rows.filter((row) => !row.releasedAt);
  const needle = normalizeSearch(query.trim());
  const visible = rows.filter(
    (row) =>
      (view === "active" ? !row.releasedAt : Boolean(row.releasedAt)) &&
      (!kind || row.kind === kind) &&
      (!needle || normalizeSearch(`${row.studentName} ${row.studentCode} ${row.className} ${row.reason}`).includes(needle)),
  );

  const create = (values: HoldFormValues) =>
    startSaving(async () => {
      const result = await createHold(values).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      setRows((current) => [result.data, ...current]);
      setIsCreating(false);
      form.resetFields();
      messageApi.success(
        values.blocking
          ? `Đã khóa đăng ký của ${result.data.studentName}. Sinh viên thấy lý do và cách gỡ trên trang đăng ký học phần.`
          : `Đã thêm lưu ý cho ${result.data.studentName}, sinh viên vẫn đăng ký được.`,
      );
    });

  const release = () => {
    if (!releasing) return;
    if (!releaseNote.trim()) {
      messageApi.warning("Ghi căn cứ gỡ khóa, ví dụ số biên lai học phí hoặc tên giấy tờ đã nhận");
      return;
    }
    startSaving(async () => {
      const result = await releaseHold(releasing.id, releaseNote).catch(() => null);
      if (!result?.ok) {
        messageApi.error(result?.message ?? NETWORK_ERROR);
        return;
      }
      setRows((current) => current.map((row) => (row.id === result.data.id ? result.data : row)));
      messageApi.success(`Đã gỡ khóa cho ${releasing.studentName}, sinh viên đăng ký được ngay`);
      setReleasing(null);
      setReleaseNote("");
    });
  };

  const columns: TableColumnsType<RegistrationHold> = [
    {
      title: "Sinh viên",
      key: "student",
      width: 220,
      render: (_, row) => (
        <span className="flex min-w-0 flex-col gap-1">
          <Link href={`${studentHrefBase}${row.studentCode}`} className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.studentName}</span>
            <span className="text-xs text-muted">
              {row.studentCode} · {row.className}
            </span>
          </Link>
          <span className="flex flex-wrap items-center gap-2 text-xs md:hidden">
            <StatusTag status={row.blocking ? BLOCKING : WARNING} />
            {HOLD_KIND_LABEL[row.kind]}
          </span>
          <span className="text-xs text-pretty text-muted md:hidden">{keepCurrencyTogether(row.reason)}</span>
        </span>
      ),
    },
    { title: "Loại", dataIndex: "kind", width: 130, responsive: ["md"], render: (value: HoldKind) => HOLD_KIND_LABEL[value] },
    { title: "Mức", key: "blocking", width: 130, responsive: ["md"], render: (_, row) => <StatusTag status={row.blocking ? BLOCKING : WARNING} /> },
    {
      title: "Lý do và cách gỡ",
      key: "reason",
      width: 330,
      responsive: ["md"],
      render: (_, row) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-pretty">{keepCurrencyTogether(row.reason)}</span>
          <span className="text-xs text-pretty text-muted">{row.resolveHint}</span>
        </span>
      ),
    },
    {
      title: view === "active" ? "Người tạo" : "Đã gỡ",
      key: "meta",
      width: 180,
      responsive: ["md"],
      render: (_, row) =>
        view === "active" ? (
          <span className="flex flex-col text-xs text-muted">
            {row.createdBy}
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
      fixed: "right",
      align: "right",
      render: (_, row) =>
        row.releasedAt ? null : (
          <Button size="small" type="text" icon={<LockOpen size={14} aria-hidden className="text-zinc-500" />} onClick={() => setReleasing(row)}>
            Gỡ khóa
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
          <Button type="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setIsCreating(true)}>
            Thêm khóa đăng ký
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<View>
            className="w-fit max-w-full"
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
        </div>
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={visible}
          scroll={{ x: "max-content" }}
          pagination={{ itemRender: paginationItemRender, pageSize: 20, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <EmptyState
                illustration={view === "active" ? "done" : "document"}
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
              <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
                Thêm khóa
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" initialValues={{ blocking: true }} onFinish={create}>
            <Form.Item name="studentId" label="Sinh viên" rules={[{ required: true, message: "Chưa chọn sinh viên" }]}>
              <Select
                showSearch={{ optionFilterProp: "label" }}
                options={students.map((student) => ({ value: student.id, label: `${student.code} ${student.fullName} (${student.className})` }))}
              />
            </Form.Item>
            <Form.Item name="kind" label="Loại" rules={[{ required: true, message: "Chưa chọn loại" }]}>
              <Select options={HOLD_KIND_OPTIONS} placeholder="Chọn loại khóa" />
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
          confirmLoading={isSaving}
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
    </>
  );
}
