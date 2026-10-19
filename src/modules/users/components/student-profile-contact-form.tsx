"use client";

import { useTransition } from "react";
import { Button, Form, Input, message } from "antd";
import { SectionCard } from "@/shared/components/ui/section-card";
import { toFormFields } from "@/shared/libs/form.lib";
import { saveMyStudentContact } from "@/modules/users/users.action";

type ContactValues = {
  schoolEmail: string;
  personalEmail: string;
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
};

export function StudentProfileContactForm({ initialValues }: { initialValues: ContactValues }) {
  const [form] = Form.useForm<ContactValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [isSaving, startSaving] = useTransition();

  return (
    <SectionCard title="Thông tin liên hệ">
      {contextHolder}
      <p className="mb-4 text-sm text-pretty text-muted">Nhà trường dùng các thông tin này để gửi thông báo học vụ và liên lạc khi khẩn cấp.</p>
      <Form<ContactValues>
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={({ schoolEmail: _schoolEmail, ...values }) =>
          startSaving(async () => {
            const result = await saveMyStudentContact(values).catch(() => null);
            if (!result?.ok) {
              if (result) form.setFields(toFormFields(result.fieldErrors));
              messageApi.error(result?.message ?? "Chưa lưu được, kiểm tra kết nối rồi thử lại.");
              return;
            }
            messageApi.success("Đã lưu thông tin liên hệ");
          })
        }
      >
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Form.Item name="schoolEmail" label="Email sinh viên" extra="Do nhà trường cấp, không đổi được">
            <Input disabled />
          </Form.Item>
          <Form.Item name="personalEmail" label="Email cá nhân" rules={[{ type: "email", message: "Email cần có dấu @ và tên miền" }]}>
            <Input autoComplete="email" inputMode="email" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Điện thoại"
            rules={[
              { required: true, message: "Chưa nhập số điện thoại" },
              { pattern: /^0\d{9}$/, message: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" },
            ]}
          >
            <Input autoComplete="tel" inputMode="tel" className="tabular-nums" />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ liên lạc">
            <Input autoComplete="street-address" />
          </Form.Item>
          <Form.Item name="emergencyName" label="Người liên hệ khẩn cấp">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="emergencyPhone" label="Điện thoại người liên hệ" rules={[{ pattern: /^0\d{9}$/, message: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" }]}>
            <Input autoComplete="off" inputMode="tel" className="tabular-nums" />
          </Form.Item>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="primary" htmlType="submit" loading={isSaving}>
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
