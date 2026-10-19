"use client";

import { useEffect, useTransition } from "react";
import { Button, Drawer, Form, Input, Radio, Select } from "antd";
import { FACULTY_OPTIONS, LECTURER_STATUS, LECTURER_TITLES } from "@/modules/users/users.constant";
import type { Lecturer, LecturerFormValues, LecturerStatus } from "@/modules/users/users.type";
import { toFormFields } from "@/shared/libs/form.lib";

type LecturerFormDrawerProps = {
  open: boolean;
  lecturer: Lecturer | null;
  onClose: () => void;
  // Trả lỗi theo ô khi server từ chối, để drawer gắn vào đúng ô.
  onSubmit: (values: LecturerFormValues) => Promise<Record<string, string> | undefined>;
};

const STATUS_OPTIONS = (Object.keys(LECTURER_STATUS) as LecturerStatus[]).map((value) => ({ value, label: LECTURER_STATUS[value].label }));

export function LecturerFormDrawer({ open, lecturer, onClose, onSubmit }: LecturerFormDrawerProps) {
  const [form] = Form.useForm<LecturerFormValues>();
  const [isPending, startTransition] = useTransition();
  const isEdit = lecturer !== null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (lecturer) form.setFieldsValue(lecturer);
  }, [open, lecturer, form]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={520}
      mask={{ closable: false }}
      destroyOnHidden
      title={isEdit ? `Sửa ${lecturer.displayName}` : "Thêm giảng viên"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={isPending} onClick={() => form.submit()}>
            {isEdit ? "Lưu thay đổi" : "Thêm giảng viên"}
          </Button>
        </div>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ status: "active" }}
        onFinish={(values) =>
          startTransition(async () => {
            const fieldErrors = await onSubmit(values);
            if (fieldErrors) form.setFields(toFormFields(fieldErrors));
          })
        }
      >
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="code" label="Mã giảng viên" rules={[{ required: true, message: "Chưa nhập mã giảng viên" }]}>
            <Input disabled={isEdit} />
          </Form.Item>
          <Form.Item name="title" label="Học hàm, học vị" rules={[{ required: true, message: "Chưa chọn học hàm, học vị" }]}>
            <Select placeholder="Chọn học hàm, học vị" options={LECTURER_TITLES.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-[1fr_auto]">
          <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="gender" label="Giới tính" rules={[{ required: true, message: "Chưa chọn giới tính" }]}>
            <Radio.Group
              options={[
                { value: "female", label: "Nữ" },
                { value: "male", label: "Nam" },
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="faculty" label="Khoa" rules={[{ required: true, message: "Chưa chọn khoa" }]}>
          <Select options={FACULTY_OPTIONS} />
        </Form.Item>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Chưa nhập email" },
              { pattern: /@hcmue\.edu\.vn$/, message: "Dùng email công vụ có đuôi @hcmue.edu.vn" },
            ]}
          >
            <Input autoComplete="off" inputMode="email" />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input autoComplete="off" inputMode="tel" className="tabular-nums" />
          </Form.Item>
        </div>
        <Form.Item name="status" label="Tình trạng">
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
