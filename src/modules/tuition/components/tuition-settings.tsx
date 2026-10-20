"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@bprogress/next/app";
import type { Dayjs } from "dayjs";
import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, message, Modal, Select, Table, type TableColumnsType } from "antd";
import { Pen, Plus } from "defeat-icons-react";
import { SectionCard } from "@/shared/components/ui/section-card";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { formatDateTime } from "@/shared/libs/date.lib";
import { toFormFields } from "@/shared/libs/form.lib";
import { finalizeTermTuition, saveTuitionFee, saveTuitionRate } from "@/modules/tuition/tuition.action";
import { formatMoney, PROVISIONAL_INVOICE } from "@/modules/tuition/tuition.constant";
import type { TermTuitionStatus, TuitionFeeRow, TuitionRateRow } from "@/modules/tuition/tuition.type";

type TuitionSettingsProps = {
  rates: TuitionRateRow[];
  fees: TuitionFeeRow[];
  terms: TermTuitionStatus[];
  majors: { code: string; name: string }[];
  // Đơn giá, khoản thu, chốt học phí là dữ liệu toàn trường: vai trò theo khoa chỉ xem.
  canManage: boolean;
};

type RateForm = { academicYear: number; majorCode: string; pricePerCredit: number; note?: string };
type FeeForm = { academicYear: number; code: string; label: string; amount: number; isMandatory: boolean };

const NETWORK_ERROR = "Chưa thực hiện được, kiểm tra kết nối rồi thử lại.";
const yearText = (year: number) => `${year}-${year + 1}`;
const moneyInput = {
  step: 1000,
  className: "w-full tabular-nums",
  suffix: "đ",
  formatter: (value: number | string | undefined) => (value === undefined || value === "" ? "" : Number(value).toLocaleString("vi-VN")),
  parser: (value: string | undefined) => Number((value ?? "").replace(/\D/g, "")),
};

export function TuitionSettings({ rates, fees, terms, majors, canManage }: TuitionSettingsProps) {
  const router = useRouter();
  const [messageApi, messageHolder] = message.useMessage();
  const [isSaving, startSaving] = useTransition();
  // Giá trị đang sửa (null là đóng); form mở mới mỗi lần nên nhận giá trị qua initialValues.
  const [rateOpen, setRateOpen] = useState<Partial<RateForm> | null>(null);
  const [feeOpen, setFeeOpen] = useState<Partial<FeeForm> | null>(null);
  const [finalizing, setFinalizing] = useState<TermTuitionStatus | null>(null);
  const [dueDate, setDueDate] = useState<Dayjs | null>(null);
  const [rateForm] = Form.useForm<RateForm>();
  const [feeForm] = Form.useForm<FeeForm>();

  const run = <T,>(work: () => Promise<{ ok: true; data: T } | { ok: false; message: string; fieldErrors?: Record<string, string> } | null>, done: (data: T) => void, form?: { setFields: (fields: ReturnType<typeof toFormFields>) => void }) =>
    startSaving(async () => {
      const result = await work().catch(() => null);
      if (!result) {
        messageApi.error(NETWORK_ERROR);
        return;
      }
      if (!result.ok) {
        if (form && result.fieldErrors) form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      done(result.data);
      router.refresh();
    });

  const rateColumns: TableColumnsType<TuitionRateRow> = [
    { title: "Năm học", dataIndex: "academicYear", width: 110, render: (value: number) => <span className="tabular-nums">{yearText(value)}</span> },
    { title: "Ngành", key: "major", width: 260, render: (_, row) => `${row.majorCode} ${row.majorName}` },
    { title: "Đơn giá/tín chỉ", dataIndex: "pricePerCredit", width: 150, align: "right", render: (value: number) => <span className="tabular-nums">{value === 0 ? "Miễn" : formatMoney(value)}</span> },
    { title: "Ghi chú", dataIndex: "note", width: 220, responsive: ["md"] },
    ...(canManage
      ? [
          {
            title: "",
            key: "edit",
            width: 64,
            align: "right" as const,
            render: (_: unknown, row: TuitionRateRow) => (
              <Button
                size="small"
                type="text"
                aria-label={`Sửa đơn giá ${row.majorName} ${yearText(row.academicYear)}`}
                icon={<Pen size={14} aria-hidden className="text-zinc-500" />}
                onClick={() => setRateOpen({ academicYear: row.academicYear, majorCode: row.majorCode, pricePerCredit: row.pricePerCredit, note: row.note })}
              />
            ),
          },
        ]
      : []),
  ];

  const feeColumns: TableColumnsType<TuitionFeeRow> = [
    { title: "Năm học", dataIndex: "academicYear", width: 110, render: (value: number) => <span className="tabular-nums">{yearText(value)}</span> },
    { title: "Khoản thu", key: "label", width: 260, render: (_, row) => `${row.label} (${row.code})` },
    { title: "Số tiền", dataIndex: "amount", width: 150, align: "right", render: (value: number) => <span className="tabular-nums">{formatMoney(value)}</span> },
    { title: "Thu", dataIndex: "isMandatory", width: 200, render: (value: boolean) => (value ? "Bắt buộc, vào hóa đơn học kỳ 1" : "Không tự vào hóa đơn") },
    ...(canManage
      ? [
          {
            title: "",
            key: "edit",
            width: 64,
            align: "right" as const,
            render: (_: unknown, row: TuitionFeeRow) => (
              <Button
                size="small"
                type="text"
                aria-label={`Sửa khoản thu ${row.label}`}
                icon={<Pen size={14} aria-hidden className="text-zinc-500" />}
                onClick={() => setFeeOpen(row)}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {messageHolder}
      <SectionCard title="Chốt học phí học kỳ">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-pretty text-muted">
            Hóa đơn tạm tính cập nhật sau mỗi lần sinh viên đăng ký, hủy, đổi lớp. Chốt học phí (thường sau đợt điều chỉnh) tính lại mọi hóa đơn, đặt hạn nộp chính thức;
            sau khi chốt, thay đổi đăng ký thành dòng điều chỉnh và quá hạn mới khóa đăng ký.
          </p>
          <ul className="flex flex-col divide-y divide-border-strong">
            {terms.map((term) => (
              <li key={term.termId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{term.termName}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {term.invoices} hóa đơn{term.provisional > 0 ? `, ${term.provisional} tạm tính` : ""}
                    {term.finalizedAt ? `, chốt gần nhất ${formatDateTime(term.finalizedAt)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {term.provisional > 0 && <StatusTag status={PROVISIONAL_INVOICE} />}
                  {canManage && (term.provisional > 0 || term.invoices === 0) && (
                    <Button
                      onClick={() => {
                        setDueDate(null);
                        setFinalizing(term);
                      }}
                    >
                      Chốt học phí
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>

      <SectionCard
        title="Đơn giá tín chỉ theo ngành"
        flush
        extra={
          canManage ? (
            <Button
              icon={<Plus size={16} aria-hidden className="text-zinc-500" />}
              onClick={() => setRateOpen({})}
            >
              Thêm đơn giá
            </Button>
          ) : undefined
        }
      >
        <Table rowKey="id" size="small" columns={rateColumns} dataSource={rates} pagination={{ pageSize: 12, hideOnSinglePage: true }} scroll={{ x: "max-content" }} />
      </SectionCard>

      <SectionCard
        title="Khoản thu cố định"
        flush
        extra={
          canManage ? (
            <Button
              icon={<Plus size={16} aria-hidden className="text-zinc-500" />}
              onClick={() => setFeeOpen({ isMandatory: true })}
            >
              Thêm khoản thu
            </Button>
          ) : undefined
        }
      >
        <Table rowKey="id" size="small" columns={feeColumns} dataSource={fees} pagination={{ pageSize: 10, hideOnSinglePage: true }} scroll={{ x: "max-content" }} />
      </SectionCard>

      <Modal
        open={rateOpen !== null}
        title="Đơn giá tín chỉ"
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={isSaving}
        onOk={() => rateForm.submit()}
        onCancel={() => setRateOpen(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form
          form={rateForm}
          initialValues={rateOpen ?? undefined}
          layout="vertical"
          onFinish={(values) =>
            run(
              () => saveTuitionRate({ ...values, note: values.note ?? "" }),
              () => {
                setRateOpen(null);
                messageApi.success("Đã lưu đơn giá. Hóa đơn tạm tính áp dụng từ lần cập nhật tới; hóa đơn đã chốt giữ nguyên.");
              },
              rateForm,
            )
          }
        >
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="academicYear" label="Năm học bắt đầu" rules={[{ required: true, message: "Chưa nhập" }]}>
              <InputNumber min={2000} max={2100} className="w-full" />
            </Form.Item>
            <Form.Item name="pricePerCredit" label="Đơn giá/tín chỉ" rules={[{ required: true, message: "Chưa nhập" }]} extra="0 là miễn học phí.">
              <InputNumber<number> min={0} {...moneyInput} />
            </Form.Item>
          </div>
          <Form.Item name="majorCode" label="Ngành" rules={[{ required: true, message: "Chưa chọn ngành" }]}>
            <Select showSearch={{ optionFilterProp: "label" }} options={majors.map((major) => ({ value: major.code, label: `${major.code} ${major.name}` }))} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú, căn cứ">
            <Input maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={feeOpen !== null}
        title="Khoản thu cố định"
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={isSaving}
        onOk={() => feeForm.submit()}
        onCancel={() => setFeeOpen(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <Form
          form={feeForm}
          initialValues={feeOpen ?? undefined}
          layout="vertical"
          onFinish={(values) =>
            run(
              () => saveTuitionFee(values),
              () => {
                setFeeOpen(null);
                messageApi.success("Đã lưu khoản thu.");
              },
              feeForm,
            )
          }
        >
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="academicYear" label="Năm học bắt đầu" rules={[{ required: true, message: "Chưa nhập" }]}>
              <InputNumber min={2000} max={2100} className="w-full" />
            </Form.Item>
            <Form.Item name="code" label="Mã" rules={[{ required: true, message: "Chưa nhập mã" }]}>
              <Input maxLength={30} />
            </Form.Item>
          </div>
          <Form.Item name="label" label="Tên khoản thu" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên" }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: "Chưa nhập" }]}>
            <InputNumber<number> min={0} {...moneyInput} />
          </Form.Item>
          <Form.Item name="isMandatory" valuePropName="checked">
            <Checkbox>Bắt buộc, tự vào hóa đơn học kỳ 1 của năm học</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={finalizing !== null}
        title={finalizing ? `Chốt học phí ${finalizing.termName}?` : ""}
        okText="Chốt học phí"
        cancelText="Hủy"
        okButtonProps={{ disabled: !dueDate, loading: isSaving }}
        onOk={() =>
          finalizing &&
          dueDate &&
          run(
            () => finalizeTermTuition({ termId: finalizing.termId, dueDate: dueDate.format("YYYY-MM-DD") }),
            (data) => {
              setFinalizing(null);
              messageApi.success(`Đã chốt ${data.finalized} hóa đơn, sinh viên nhận thông báo hạn nộp.`);
            },
          )
        }
        onCancel={() => setFinalizing(null)}
        mask={{ closable: false }}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <Alert
            type="warning"
            showIcon
            title="Không hoàn tác được"
            description="Mọi hóa đơn tạm tính được tính lại theo đăng ký hiện có rồi chuyển thành chính thức. Sau đó đăng ký thay đổi chỉ thêm dòng điều chỉnh."
          />
          <Form layout="vertical">
            <Form.Item label="Hạn nộp chính thức" required>
              <DatePicker value={dueDate} onChange={setDueDate} format="DD/MM/YYYY" className="w-full" />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
