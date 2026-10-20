"use client";

import { useState, useTransition } from "react";
import { Button, Checkbox, Drawer, Form, Input, message } from "antd";
import { Plus } from "defeat-icons-react";
import { toFormFields } from "@/shared/libs/form.lib";
import { createStaffMember } from "@/modules/users/users.action";
import type { StaffFormValues } from "@/modules/users/users.type";

// Thêm cán bộ (kèm tài khoản) ở trang Phân quyền; tạo xong thì cán bộ có trong danh sách "Cấp quyền".
export function StaffCreateButton() {
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<StaffFormValues>();
  const [isPending, startTransition] = useTransition();

  const submit = (values: StaffFormValues) =>
    startTransition(async () => {
      const result = await createStaffMember(values).catch(() => null);
      if (!result) {
        messageApi.error("Chưa lưu được, kiểm tra kết nối rồi thử lại.");
        return;
      }
      if (!result.ok) {
        form.setFields(toFormFields(result.fieldErrors));
        messageApi.error(result.message);
        return;
      }
      const { name, hasAccount } = result.data;
      const note = hasAccount ? `, đã gửi thư kích hoạt tới ${values.email}` : ", chưa cấp tài khoản";
      messageApi.success(`Đã thêm cán bộ ${name}${note}. Bấm "Cấp quyền" để giao vai trò.`, 8);
      setOpen(false);
    });

  return (
    <>
      {contextHolder}
      <Button icon={<Plus size={16} aria-hidden className="text-zinc-500" />} onClick={() => setOpen(true)}>
        Thêm cán bộ
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        size={480}
        mask={{ closable: false }}
        destroyOnHidden
        title="Thêm cán bộ"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="primary" loading={isPending} onClick={() => form.submit()}>
              Thêm cán bộ
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ provisionAccount: true }} onFinish={submit}>
          <div className="grid gap-x-3 sm:grid-cols-[10rem_1fr]">
            <Form.Item name="code" label="Mã cán bộ" rules={[{ required: true, whitespace: true, message: "Chưa nhập mã cán bộ" }]}>
              <Input autoComplete="off" placeholder="CB0105" />
            </Form.Item>
            <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: "Chưa nhập họ và tên" }]}>
              <Input autoComplete="off" />
            </Form.Item>
          </div>
          <Form.Item name="unit" label="Đơn vị" rules={[{ required: true, whitespace: true, message: "Chưa nhập đơn vị" }]}>
            <Input autoComplete="off" placeholder="Phòng Đào tạo" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email công vụ"
            extra="Cán bộ đăng nhập bằng email này."
            rules={[
              { required: true, message: "Chưa nhập email" },
              { pattern: /^[^@\s]+@hcmue\.edu\.vn$/i, message: "Dùng email công vụ có đuôi @hcmue.edu.vn" },
            ]}
          >
            <Input autoComplete="off" inputMode="email" />
          </Form.Item>
          <Form.Item name="provisionAccount" valuePropName="checked" extra="Cán bộ tự đặt mật khẩu qua đường dẫn trong thư. Vai trò quản trị cấp riêng ở bảng bên dưới.">
            <Checkbox>Cấp tài khoản và gửi thư kích hoạt</Checkbox>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
