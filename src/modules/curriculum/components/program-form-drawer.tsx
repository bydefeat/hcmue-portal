"use client";

import { useEffect } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select } from "antd";
import { MOCK_COHORTS, MOCK_MAJORS } from "@/shared/libs/mock.lib";
import { DEGREE_OPTIONS, PROGRAM_STATUS_OPTIONS } from "@/modules/curriculum/curriculum.constant";
import type { Program, ProgramFormValues } from "@/modules/curriculum/curriculum.type";

type ProgramFormDrawerProps = {
  open: boolean;
  program: Program | null;
  onClose: () => void;
  onSubmit: (values: ProgramFormValues) => void;
};

const MAJOR_OPTIONS = MOCK_MAJORS.map((major) => ({ value: major.code, label: `${major.name} (${major.faculty})` }));
const COHORT_OPTIONS = [...MOCK_COHORTS, 52].map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }));

const EMPTY_VALUES: Partial<ProgramFormValues> = { degree: "Cử nhân", totalCredits: 130, durationYears: 4, cohorts: [], status: "draft" };

export function ProgramFormDrawer({ open, program, onClose, onSubmit }: ProgramFormDrawerProps) {
  const [form] = Form.useForm<ProgramFormValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(program ?? EMPTY_VALUES);
  }, [open, program, form]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={560}
      destroyOnHidden
      mask={{ closable: false }}
      title={program ? `Sửa chương trình ${program.name}` : "Thêm chương trình đào tạo"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" onClick={() => form.submit()}>
            {program ? "Lưu thay đổi" : "Thêm chương trình"}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="Tên chương trình" rules={[{ required: true, whitespace: true, message: "Chưa nhập tên chương trình" }]}>
          <Input />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item
            name="code"
            label="Mã ngành"
            rules={[
              { required: true, message: "Chưa nhập mã ngành" },
              { pattern: /^\d{7}$/, message: "Mã ngành gồm 7 chữ số theo danh mục của Bộ" },
            ]}
          >
            <Input inputMode="numeric" />
          </Form.Item>
          <Form.Item name="degree" label="Văn bằng" rules={[{ required: true, message: "Chưa chọn văn bằng" }]}>
            <Select options={DEGREE_OPTIONS} />
          </Form.Item>
        </div>
        <Form.Item name="majorCode" label="Ngành đào tạo" rules={[{ required: true, message: "Chưa chọn ngành" }]}>
          <Select options={MAJOR_OPTIONS} showSearch={{ optionFilterProp: "label" }} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="totalCredits" label="Tổng tín chỉ" rules={[{ required: true, message: "Chưa nhập tổng tín chỉ" }]}>
            <InputNumber min={60} max={200} className="w-full" />
          </Form.Item>
          <Form.Item name="durationYears" label="Thời gian đào tạo (năm)" rules={[{ required: true, message: "Chưa nhập thời gian" }]}>
            <InputNumber min={2} max={6} step={0.5} className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="cohorts" label="Khóa áp dụng" rules={[{ required: true, type: "array", min: 1, message: "Chọn ít nhất một khóa" }]}>
          <Select mode="multiple" options={COHORT_OPTIONS} />
        </Form.Item>
        <Form.Item name="status" label="Trạng thái" rules={[{ required: true, message: "Chưa chọn trạng thái" }]}>
          <Select options={PROGRAM_STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
