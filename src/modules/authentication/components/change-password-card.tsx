"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Button, Form, Input, message, Modal } from "antd";
import { authClient } from "@/shared/libs/auth-client.lib";
import { SectionCard } from "@/shared/components/ui/section-card";
import { NEW_PASSWORD_RULES, authErrorMessage } from "@/modules/authentication/authentication.constant";

type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };

export function ChangePasswordCard() {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<PasswordValues>();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    setIsOpen(false);
    setError(null);
    form.resetFields();
  };

  const submit = (values: PasswordValues) =>
    startTransition(async () => {
      const result = await authClient.changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword, revokeOtherSessions: true });
      if (result.error) {
        setError(authErrorMessage(result.error));
        return;
      }
      close();
      messageApi.success("Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.");
    });

  return (
    <SectionCard title="Mật khẩu">
      {contextHolder}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-pretty text-muted">Đổi mật khẩu định kỳ và không dùng lại mật khẩu của tài khoản khác.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setIsOpen(true)}>Đổi mật khẩu</Button>
          <Link href="/authentication/forgot-password" className="text-sm">
            Quên mật khẩu hiện tại
          </Link>
        </div>
      </div>
      <Modal title="Đổi mật khẩu" open={isOpen} onCancel={close} onOk={() => form.submit()} okText="Đổi mật khẩu" cancelText="Hủy" confirmLoading={isPending} destroyOnHidden>
        {error && <Alert type="error" showIcon title={error} className="mb-4" />}
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} onValuesChange={() => setError(null)}>
          <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: "Chưa nhập mật khẩu hiện tại" }]}>
            <Input.Password autoComplete="current-password" autoFocus />
          </Form.Item>
          <Form.Item name="newPassword" label="Mật khẩu mới" rules={NEW_PASSWORD_RULES}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Nhập lại mật khẩu mới"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "Chưa nhập lại mật khẩu mới" },
              ({ getFieldValue }) => ({
                validator: (_, value) => (!value || value === getFieldValue("newPassword") ? Promise.resolve() : Promise.reject(new Error("Hai mật khẩu chưa khớp"))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </SectionCard>
  );
}
