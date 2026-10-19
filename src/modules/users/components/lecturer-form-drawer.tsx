"use client";

import { useEffect } from "react";
import { Button, Checkbox, Drawer, Form, Input, Select } from "antd";
import { FACULTY_OPTIONS, LECTURER_STATUS, LECTURER_TITLES, USER_ROLES } from "../users.constant";
import type { Lecturer, LecturerFormValues, LecturerStatus } from "../users.type";

type LecturerFormDrawerProps = {
  open: boolean;
  lecturer: Lecturer | null;
  onClose: () => void;
  onSubmit: (values: LecturerFormValues) => void;
};

const STATUS_OPTIONS = (Object.keys(LECTURER_STATUS) as LecturerStatus[]).map((value) => ({ value, label: LECTURER_STATUS[value].label }));

export function LecturerFormDrawer({ open, lecturer, onClose, onSubmit }: LecturerFormDrawerProps) {
  const [form] = Form.useForm<LecturerFormValues>();
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
          <Button type="primary" onClick={() => form.submit()}>
            {isEdit ? "Lưu thay đổi" : "Thêm giảng viên"}
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ status: "active", roles: ["lecturer"] }} onFinish={onSubmit}>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="code" label="Mã giảng viên" rules={[{ required: true, message: "Chưa nhập mã giảng viên" }]}>
            <Input disabled={isEdit} />
          </Form.Item>
          <Form.Item name="title" label="Học hàm, học vị" rules={[{ required: true, message: "Chưa chọn học hàm, học vị" }]}>
            <Select placeholder="Chọn học hàm, học vị" options={LECTURER_TITLES.map((value) => ({ value, label: value }))} />
          </Form.Item>
        </div>
        <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
          <Input autoComplete="off" />
        </Form.Item>
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
        <Form.Item
          name="roles"
          label="Vai trò"
          extra="Vai trò Cố vấn học tập mở mục Cố vấn trên cổng giảng viên"
          rules={[{ required: true, message: "Chọn ít nhất một vai trò" }]}
        >
          <Checkbox.Group options={USER_ROLES} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
