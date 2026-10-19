"use client";

import { useState } from "react";
import { Button, Card, DatePicker, Form, Input, InputNumber, message, Modal, Table } from "antd";
import type { Dayjs } from "dayjs";
import { StatusTag } from "@/shared/components/ui/status-tag";
import { dayjs, formatDate, formatDateTime } from "@/shared/libs/date.lib";
import type { RegulationSettings, RegulationVersion } from "../settings.type";
import { SectionCard } from "@/shared/components/ui/section-card";

type RegulationFormProps = {
  regulation: RegulationSettings;
  versions: RegulationVersion[];
};

type SaveValues = { reason: string; effectiveFrom: Dayjs };

function SectionDescription({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 max-w-prose text-sm text-pretty text-muted">{children}</p>;
}

function NumberField({ name, label, min, max, step = 1, suffix }: { name: (string | number)[]; label: string; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <Form.Item name={name} label={label} rules={[{ required: true, message: `Chưa nhập ${label.toLowerCase()}` }]}>
      <InputNumber min={min} max={max} step={step} decimalSeparator="," suffix={suffix} className="w-full tabular-nums" />
    </Form.Item>
  );
}

export function RegulationForm({ regulation, versions }: RegulationFormProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<RegulationSettings>();
  const [saveForm] = Form.useForm<SaveValues>();
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [current, setCurrent] = useState(regulation);

  const submit = async () => {
    try {
      await form.validateFields();
      const scale = form.getFieldValue(["grading", "scale"]) as RegulationSettings["grading"]["scale"];
      const sorted = scale.every((step, index) => index === 0 || step.min < scale[index - 1].min);
      if (!sorted) {
        messageApi.error("Thang điểm chữ phải xếp ngưỡng giảm dần từ A đến F. Kiểm tra lại cột Từ điểm.");
        return;
      }
      saveForm.resetFields();
      setConfirmOpen(true);
    } catch {
      messageApi.error("Còn trường chưa hợp lệ, xem các ô có viền đỏ.");
    }
  };

  const save = (values: SaveValues) => {
    const next = {
      ...current,
      ...form.getFieldsValue(true),
      updatedAt: dayjs().toISOString(),
      effectiveFrom: values.effectiveFrom.format("YYYY-MM-DD"),
    };
    setCurrent(next);
    setIsDirty(false);
    setConfirmOpen(false);
    messageApi.success(`Đã lưu quy chế, áp dụng từ ${values.effectiveFrom.format("DD/MM/YYYY")}. Thay đổi được ghi vào nhật ký thao tác.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start sm:gap-6">
      {contextHolder}
      <Form form={form} layout="vertical" initialValues={regulation} onValuesChange={() => setIsDirty(true)} className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Thang điểm">
          <SectionDescription>Quy đổi điểm học phần từ thang 10 sang điểm chữ và thang 4. Ngưỡng là điểm thấp nhất để đạt mức đó.</SectionDescription>
          <Form.List name={["grading", "scale"]}>
            {(fields) => (
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={fields}
                scroll={{ x: 360 }}
                className="mb-4"
                columns={[
                  {
                    title: "Điểm chữ",
                    key: "letter",
                    width: 96,
                    render: (_, field) => (
                      <Form.Item name={[field.name, "letter"]} noStyle>
                        <Input readOnly variant="borderless" className="w-16 px-0 font-medium" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: "Từ điểm (thang 10)",
                    key: "min",
                    render: (_, field) => (
                      <Form.Item name={[field.name, "min"]} className="mb-0" rules={[{ required: true, message: "Chưa nhập" }]}>
                        <InputNumber min={0} max={10} step={0.5} decimalSeparator="," className="w-28 tabular-nums" />
                      </Form.Item>
                    ),
                  },
                  {
                    title: "Thang 4",
                    key: "point4",
                    render: (_, field) => (
                      <Form.Item name={[field.name, "point4"]} className="mb-0" rules={[{ required: true, message: "Chưa nhập" }]}>
                        <InputNumber min={0} max={4} step={0.5} decimalSeparator="," className="w-28 tabular-nums" />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            )}
          </Form.List>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <NumberField name={["grading", "passScore"]} label="Điểm đạt học phần" min={0} max={10} step={0.5} />
            <NumberField name={["grading", "roundingStep"]} label="Làm tròn điểm học phần đến" min={0.1} max={1} step={0.1} />
          </div>
        </SectionCard>

        <SectionCard title="Hạn mức tín chỉ">
          <SectionDescription>Áp dụng khi kiểm tra đăng ký học phần. Sinh viên bị cảnh báo học vụ dùng hạn mức riêng.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["credits", "minPerTerm"]} label="Tối thiểu mỗi học kỳ" min={0} max={30} suffix="TC" />
            <NumberField name={["credits", "maxPerTerm"]} label="Tối đa mỗi học kỳ" min={1} max={40} suffix="TC" />
            <NumberField name={["credits", "maxSummer"]} label="Tối đa học kỳ hè" min={0} max={20} suffix="TC" />
            <NumberField name={["credits", "maxWhenWarned"]} label="Tối đa khi bị cảnh báo" min={0} max={30} suffix="TC" />
            <NumberField name={["credits", "overloadMinCpa"]} label="CPA tối thiểu để học vượt" min={0} max={4} step={0.1} />
          </div>
        </SectionCard>

        <SectionCard title="Cảnh báo học vụ">
          <SectionDescription>Hệ thống tự xét cảnh báo sau khi công bố điểm học kỳ theo các ngưỡng dưới đây.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["warning", "level1TermGpa"]} label="Mức 1: ĐTB học kỳ dưới" min={0} max={4} step={0.1} />
            <NumberField name={["warning", "level1FailedCredits"]} label="Mức 1: nợ từ" min={0} max={60} suffix="TC" />
            <NumberField name={["warning", "level2Cpa"]} label="Mức 2: CPA dưới" min={0} max={4} step={0.1} />
            <NumberField name={["warning", "level2FailedCredits"]} label="Mức 2: nợ từ" min={0} max={60} suffix="TC" />
            <NumberField name={["warning", "level3Cpa"]} label="Mức 3: CPA dưới" min={0} max={4} step={0.1} />
          </div>
        </SectionCard>

        <SectionCard title="Chuyên cần và thời hạn xử lý">
          <SectionDescription>Thời hạn tính theo ngày từ khi việc đến lượt người xử lý.</SectionDescription>
          <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField name={["attendance", "absenceLimitPercent"]} label="Vắng quá thì cấm thi" min={0} max={100} suffix="%" />
            <NumberField name={["workflow", "gradeEntryDays"]} label="Hạn nhập điểm sau ngày thi" min={1} max={30} suffix="ngày" />
            <NumberField name={["workflow", "gradeDueSoonDays"]} label="Nhắc sắp hết hạn trước" min={1} max={14} suffix="ngày" />
            <NumberField name={["workflow", "studyPlanReviewDays"]} label="Cố vấn duyệt kế hoạch trong" min={1} max={14} suffix="ngày" />
            <NumberField name={["workflow", "regradeWindowDays"]} label="Nhận đơn phúc khảo trong" min={1} max={30} suffix="ngày" />
            <NumberField name={["workflow", "registrationClosingSoonHours"]} label="Báo đợt sắp đóng trước" min={1} max={168} suffix="giờ" />
          </div>
        </SectionCard>

        <Card size="small" className="sticky bottom-24 z-10 lg:bottom-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isDirty ? <StatusTag status={{ label: "Có thay đổi chưa lưu", tone: "warning" }} /> : <span className="text-xs text-muted">Không có thay đổi</span>}
            <Button
              disabled={!isDirty}
              onClick={() => {
                form.resetFields();
                setIsDirty(false);
              }}
            >
              Hoàn tác
            </Button>
            <Button type="primary" disabled={!isDirty} onClick={submit}>
              Lưu quy chế
            </Button>
          </div>
        </Card>
      </Form>

      <aside className="flex flex-col gap-4">
        <SectionCard title="Phiên bản đang áp dụng">
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              {current.version}, từ <span className="tabular-nums">{formatDate(current.effectiveFrom)}</span>
            </p>
            <p className="text-xs text-muted tabular-nums">
              Sửa lần cuối {formatDateTime(current.updatedAt)} bởi {current.updatedBy}
            </p>
          </div>
        </SectionCard>
        <SectionCard title="Lịch sử quy chế">
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-3">
              {versions.map((version) => (
                <li key={version.version} className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {version.version} · Quyết định {version.decision}
                  </span>
                  <span className="text-xs text-muted tabular-nums">Áp dụng từ {formatDate(version.effectiveFrom)}</span>
                  <span className="text-sm text-pretty text-muted">{version.summary}</span>
                </li>
              ))}
            </ol>
          </div>
        </SectionCard>
      </aside>

      <Modal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        title="Lưu thay đổi quy chế"
        okText="Lưu quy chế"
        cancelText="Hủy"
        onOk={() => saveForm.submit()}
        mask={{ closable: false }}
        destroyOnHidden
        width={480}
      >
        <p className="mb-4 text-sm text-pretty text-muted">
          Quy chế mới ảnh hưởng đến xét cảnh báo, đăng ký học phần và quy đổi điểm của toàn trường. Ghi rõ căn cứ để lưu vào nhật ký.
        </p>
        <Form form={saveForm} layout="vertical" onFinish={save} initialValues={{ effectiveFrom: dayjs().add(1, "day") }}>
          <Form.Item name="reason" label="Căn cứ, lý do thay đổi" rules={[{ required: true, whitespace: true, message: "Chưa nhập căn cứ thay đổi" }]}>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={300} showCount />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="Áp dụng từ ngày" rules={[{ required: true, message: "Chưa chọn ngày áp dụng" }]}>
            <DatePicker format="DD/MM/YYYY" className="w-full" disabledDate={(date) => date.isBefore(dayjs().startOf("day"))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
