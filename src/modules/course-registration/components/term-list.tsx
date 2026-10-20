"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@bprogress/next/app";
import type { Dayjs } from "dayjs";
import { Button, DatePicker, Dropdown, Form, InputNumber, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { DotsVertical, Plus } from "defeat-icons-react";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import type { StatusMeta } from "@/shared/constants/status.constant";
import { createTerm, setTermFlag } from "@/modules/course-registration/course-registration.action";
import { termNaming } from "@/modules/course-registration/course-registration.rule";
import type { Term } from "@/modules/course-registration/course-registration.type";

export type TermRow = Term & {
  academicYear: number;
  semester: number;
  sectionCount: number;
  periodCount: number;
};

const CURRENT: StatusMeta = { label: "Đang diễn ra", tone: "success" };
const TARGET: StatusMeta = { label: "Đang nhận đăng ký", tone: "warning" };

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";

const SEMESTER_OPTIONS = [
  { value: 1, label: "Học kỳ 1" },
  { value: 2, label: "Học kỳ 2" },
  { value: 3, label: "Học kỳ hè" },
];

type TermForm = { academicYear: number; semester: number; range: [Dayjs, Dayjs] };

const FLAG_TEXT = {
  current: {
    title: (name: string) => `Đặt ${name} là học kỳ hiện tại?`,
    content: "Thời khóa biểu, điểm danh, học phí, khóa đăng ký do học phí quá hạn và lớp \"đang học\" của mọi sinh viên, giảng viên chuyển sang học kỳ này ngay. Học kỳ hiện tại cũ thôi đánh dấu.",
    done: (name: string) => `Đã đặt ${name} là học kỳ hiện tại`,
  },
  "registration-target": {
    title: (name: string) => `Mở nhận đăng ký cho ${name}?`,
    content: "Trang đăng ký của sinh viên, theo dõi đăng ký, mở lớp và đăng ký hộ chuyển sang học kỳ này ngay. Học kỳ đang nhận đăng ký cũ thôi đánh dấu; đợt đăng ký của nó vẫn giữ.",
    done: (name: string) => `${name} đang nhận đăng ký`,
  },
} as const;

export function TermList({ terms, canManage }: { terms: TermRow[]; canManage: boolean }) {
  const router = useRouter();
  const [messageApi, messageHolder] = message.useMessage();
  const [modal, modalHolder] = Modal.useModal();
  const [rows, setRows] = useState(terms);
  const [creating, setCreating] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [form] = Form.useForm<TermForm>();
  const ordered = [...rows].toSorted((a, b) => b.startDate.localeCompare(a.startDate));

  const setFlag = (term: TermRow, flag: keyof typeof FLAG_TEXT) =>
    modal.confirm({
      title: FLAG_TEXT[flag].title(term.name),
      content: FLAG_TEXT[flag].content,
      okText: "Xác nhận",
      cancelText: "Hủy",
      mask: { closable: false },
      onOk: async () => {
        const result = await setTermFlag(term.id, flag).catch(() => null);
        if (!result?.ok) {
          messageApi.error(result?.message ?? NETWORK_ERROR);
          return;
        }
        const updated = new Map(result.data.map((entry) => [entry.id, entry]));
        setRows((current) => current.map((row) => ({ ...row, ...updated.get(row.id) })));
        messageApi.success(FLAG_TEXT[flag].done(term.name));
        router.refresh();
      },
    });

  const submit = (values: TermForm) =>
    startSaving(async () => {
      const result = await createTerm({
        academicYear: values.academicYear,
        semester: values.semester,
        startDate: values.range[0].format("YYYY-MM-DD"),
        endDate: values.range[1].format("YYYY-MM-DD"),
      }).catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        messageApi.error(result.message);
        if (result.fieldErrors) form.setFields(toFormFields({ ...result.fieldErrors, ...(result.fieldErrors.startDate || result.fieldErrors.endDate ? { range: result.fieldErrors.endDate ?? result.fieldErrors.startDate } : {}) }));
        return;
      }
      const term = result.data;
      setRows((current) => [...current, { ...term, academicYear: values.academicYear, semester: values.semester, sectionCount: 0, periodCount: 0 }]);
      setCreating(false);
      messageApi.success(`Đã tạo ${term.name}. Mở lớp và đợt đăng ký trước khi đặt nhận đăng ký.`);
    });

  const columns: TableColumnsType<TermRow> = [
    { title: "Mã học kỳ", dataIndex: "code", width: 120, responsive: ["md"], render: (code: string) => <span className="text-xs">{code}</span> },
    {
      title: "Học kỳ",
      dataIndex: "name",
      width: 260,
      render: (name: string, row) => (
        <span className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{name}</span>
            {row.isCurrent && <StatusTag status={CURRENT} />}
            {row.isRegistrationTarget && <StatusTag status={TARGET} />}
          </span>
          <span className="text-xs text-muted tabular-nums md:hidden">
            {formatDate(row.startDate)} đến {formatDate(row.endDate)}
          </span>
        </span>
      ),
    },
    {
      title: "Thời gian",
      key: "time",
      width: 200,
      responsive: ["md"],
      render: (_, row) => (
        <span className="tabular-nums">
          {formatDate(row.startDate)} đến {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      title: <span className="whitespace-nowrap">Số tuần</span>,
      key: "weeks",
      width: 90,
      responsive: ["lg"],
      align: "right",
      render: (_, row) => <span className="tabular-nums">{Math.round(dayjs(row.endDate).diff(row.startDate, "day") / 7)}</span>,
    },
    {
      title: <span className="whitespace-nowrap">Lớp học phần</span>,
      dataIndex: "sectionCount",
      width: 120,
      responsive: ["md"],
      align: "right",
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    {
      title: <span className="whitespace-nowrap">Đợt đăng ký</span>,
      dataIndex: "periodCount",
      width: 120,
      responsive: ["md"],
      align: "right",
      render: (value: number) => <span className="tabular-nums">{value}</span>,
    },
    ...(canManage
      ? [
          {
            title: "",
            key: "actions",
            width: 56,
            align: "right" as const,
            render: (_: unknown, row: TermRow) => {
              const items = [
                ...(row.isCurrent ? [] : [{ key: "current", label: "Đặt làm học kỳ hiện tại" }]),
                ...(row.isRegistrationTarget ? [] : [{ key: "registration-target", label: "Mở nhận đăng ký" }]),
              ];
              if (items.length === 0) return null;
              return (
                <Dropdown menu={{ items, onClick: ({ key }) => setFlag(row, key as keyof typeof FLAG_TEXT) }} trigger={["click"]}>
                  <Button size="small" type="text" aria-label={`Thao tác với ${row.name}`} icon={<DotsVertical size={16} aria-hidden className="text-zinc-500" />} />
                </Dropdown>
              );
            },
          },
        ]
      : []),
  ];

  const academicYear = Form.useWatch("academicYear", form);
  const semester = Form.useWatch("semester", form);
  const preview = academicYear && semester ? termNaming(academicYear, semester).name : null;

  return (
    <>
      {messageHolder}
      {modalHolder}
      {canManage && (
        <div className="flex justify-end border-b border-border-strong px-4 py-3 sm:px-5">
          <Button
            icon={<Plus size={16} aria-hidden className="text-zinc-500" />}
            onClick={() => {
              form.resetFields();
              setCreating(true);
            }}
          >
            Thêm học kỳ
          </Button>
        </div>
      )}
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={ordered}
        pagination={false}
        scroll={{ x: "max-content" }}
        rowClassName={(row) => (row.isCurrent || row.isRegistrationTarget ? "" : "text-muted")}
      />
      <Modal
        open={creating}
        title="Thêm học kỳ"
        okText="Tạo học kỳ"
        cancelText="Hủy"
        confirmLoading={isSaving}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="academicYear" label="Năm học bắt đầu" rules={[{ required: true, message: "Chưa nhập năm học" }]}>
              <InputNumber min={2000} max={2100} className="w-full" />
            </Form.Item>
            <Form.Item name="semester" label="Học kỳ" rules={[{ required: true, message: "Chưa chọn học kỳ" }]}>
              <Select options={SEMESTER_OPTIONS} />
            </Form.Item>
          </div>
          <Form.Item name="range" label="Ngày bắt đầu và kết thúc" rules={[{ required: true, message: "Chưa chọn thời gian" }]}>
            <DatePicker.RangePicker format="DD/MM/YYYY" placeholder={["Bắt đầu", "Kết thúc"]} className="w-full" />
          </Form.Item>
          {preview && <p className="text-xs text-muted">Tên học kỳ: {preview}</p>}
        </Form>
      </Modal>
    </>
  );
}
