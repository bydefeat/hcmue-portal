"use client";

import { useEffect, useTransition } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select } from "antd";
import { toFormFields } from "@/shared/libs/form.lib";
import { DEGREE_OPTIONS, PROGRAM_STATUS_OPTIONS } from "@/modules/curriculum/curriculum.constant";
import type { Major, Program, ProgramFormValues } from "@/modules/curriculum/curriculum.type";

type ProgramFormDrawerProps = {
  open: boolean;
  program: Program | null;
  majors: Major[];
  // Các khóa đang có lớp sinh hoạt, đọc từ DB.
  cohorts: number[];
  onClose: () => void;
  // Trả lỗi theo ô khi server từ chối, để drawer gắn vào đúng ô.
  onSubmit: (values: ProgramFormValues) => Promise<Record<string, string> | undefined>;
};

const EMPTY_VALUES: Partial<ProgramFormValues> = { degree: "Cử nhân", totalCredits: 130, durationYears: 4, cohorts: [], status: "draft" };

export function ProgramFormDrawer({ open, program, majors, cohorts, onClose, onSubmit }: ProgramFormDrawerProps) {
  // Khóa đang có lớp, thêm khóa kế tiếp (khung chương trình thường ban hành trước khi tân sinh viên nhập học)
  // và các khóa chương trình đang áp dụng.
  const nextCohort = cohorts.length > 0 ? [Math.max(...cohorts) + 1] : [];
  const cohortOptions = [...new Set([...cohorts, ...nextCohort, ...(program?.cohorts ?? [])])]
    .toSorted((a, b) => a - b)
    .map((cohort) => ({ value: cohort, label: `Khóa ${cohort}` }));
  const [form] = Form.useForm<ProgramFormValues>();
  const [isPending, startTransition] = useTransition();

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
          <Button type="primary" loading={isPending} onClick={() => form.submit()}>
            {program ? "Lưu thay đổi" : "Thêm chương trình"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit(values);
            if (fieldErrors) form.setFields(toFormFields(fieldErrors));
          })
        }
      >
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
          <Select options={majors.map((major) => ({ value: major.code, label: `${major.name} (${major.faculty})` }))} showSearch={{ optionFilterProp: "label" }} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="totalCredits" label="Tổng tín chỉ" rules={[{ required: true, message: "Chưa nhập tổng tín chỉ" }]}>
            <InputNumber min={60} max={200} className="w-full" />
          </Form.Item>
          <Form.Item name="durationYears" label="Thời gian đào tạo (năm)" rules={[{ required: true, message: "Chưa nhập thời gian" }]}>
            <InputNumber min={1} max={8} precision={0} className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="cohorts" label="Khóa áp dụng" rules={[{ required: true, type: "array", min: 1, message: "Chọn ít nhất một khóa" }]}>
          <Select mode="multiple" options={cohortOptions} />
        </Form.Item>
        <Form.Item name="status" label="Trạng thái" rules={[{ required: true, message: "Chưa chọn trạng thái" }]}>
          <Select options={PROGRAM_STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
