"use client";

import { useEffect } from "react";
import type { Dayjs } from "dayjs";
import { DatePicker, Form, Input, InputNumber, Modal, Select } from "antd";
import { dayjs } from "@/shared/libs/date.lib";
import { MOCK_COHORTS } from "@/shared/libs/mock.lib";
import type { RegistrationPeriod } from "../course-registration.type";

export type PeriodFormResult = {
  name: string;
  cohorts: number[];
  opensAt: string;
  closesAt: string;
  minCredits: number;
  maxCredits: number;
};

type FormShape = {
  name: string;
  cohorts: number[];
  range: [Dayjs, Dayjs];
  minCredits: number;
  maxCredits: number;
};

type RegistrationPeriodFormModalProps = {
  open: boolean;
  period: RegistrationPeriod | null;
  termName: string;
  onClose: () => void;
  onSubmit: (values: PeriodFormResult) => void;
};

const COHORT_OPTIONS = MOCK_COHORTS.map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }));

export function RegistrationPeriodFormModal({ open, period, termName, onClose, onSubmit }: RegistrationPeriodFormModalProps) {
  const [form] = Form.useForm<FormShape>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      period
        ? { ...period, range: [dayjs(period.opensAt), dayjs(period.closesAt)] }
        : { minCredits: 14, maxCredits: 25, cohorts: [] },
    );
  }, [open, period, form]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      width={640}
      destroyOnHidden
      mask={{ closable: false }}
      title={period ? "Sửa đợt đăng ký" : "Mở đợt đăng ký"}
      okText={period ? "Lưu thay đổi" : "Tạo đợt"}
      cancelText="Hủy"
    >
      <p className="mb-4 text-sm text-muted">{period ? `${period.name}, ${termName}` : termName}</p>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          onSubmit({
            name: values.name,
            cohorts: values.cohorts,
            opensAt: values.range[0].toISOString(),
            closesAt: values.range[1].toISOString(),
            minCredits: values.minCredits,
            maxCredits: values.maxCredits,
          })
        }
      >
        <Form.Item name="name" label="Tên đợt" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên đợt" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="cohorts" label="Khóa được đăng ký" rules={[{ required: true, type: "array", min: 1, message: "Chọn ít nhất một khóa" }]}>
          <Select mode="multiple" placeholder="Chọn khóa" options={COHORT_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="range"
          label="Thời gian mở và đóng"
          rules={[
            { required: true, message: "Chưa chọn thời gian" },
            {
              validator: (_, value: [Dayjs, Dayjs] | undefined) =>
                !value || value[1].diff(value[0], "hour") >= 12
                  ? Promise.resolve()
                  : Promise.reject(new Error("Đợt cần mở ít nhất 12 giờ để sinh viên kịp đăng ký")),
            },
          ]}
        >
          <DatePicker.RangePicker showTime={{ format: "HH:mm" }} format="HH:mm DD/MM/YYYY" placeholder={["Mở lúc", "Đóng lúc"]} className="w-full" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-x-3">
          <Form.Item name="minCredits" label="Tín chỉ tối thiểu" rules={[{ required: true, message: "Chưa nhập" }]}>
            <InputNumber min={0} max={30} className="w-full" />
          </Form.Item>
          <Form.Item
            name="maxCredits"
            label="Tín chỉ tối đa"
            dependencies={["minCredits"]}
            rules={[
              { required: true, message: "Chưa nhập" },
              ({ getFieldValue }) => ({
                validator: (_, value: number) =>
                  value >= getFieldValue("minCredits")
                    ? Promise.resolve()
                    : Promise.reject(new Error("Tối đa phải lớn hơn hoặc bằng tối thiểu")),
              }),
            ]}
          >
            <InputNumber min={1} max={40} className="w-full" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
