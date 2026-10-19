"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@bprogress/next/app";
import { Button, Divider, Form, Input } from "antd";
import { DEMO_ACCOUNTS, demoRolesOf, landingOf } from "@/shared/constants/role.constant";
import { AuthHeading } from "./auth-heading";

type SignInValues = {
  username: string;
  password: string;
};

export function SignInForm({ defaultUsername }: { defaultUsername?: string }) {
  const router = useRouter();
  const [form] = Form.useForm<SignInValues>();
  const [isPending, startTransition] = useTransition();
  const username = Form.useWatch("username", form);
  const forgotHref = username?.includes("@")
    ? `/authentication/forgot-password?email=${encodeURIComponent(username)}`
    : "/authentication/forgot-password";

  return (
    <>
      <AuthHeading title="Đăng nhập" />
      <Form
        form={form}
        layout="vertical"
        size="large"
        requiredMark={false}
        initialValues={{ username: defaultUsername }}
        onFinish={(values) => startTransition(() => router.push(landingOf(demoRolesOf(values.username))))}
      >
        <Form.Item
          name="username"
          label="Tên đăng nhập"
          rules={[{ required: true, whitespace: true, message: "Chưa nhập tên đăng nhập" }]}
        >
          <Input autoFocus={!defaultUsername} autoComplete="username" placeholder="Nhập mã số hoặc email" />
        </Form.Item>
        <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Chưa nhập mật khẩu" }]}>
          <Input.Password autoFocus={Boolean(defaultUsername)} autoComplete="current-password" placeholder="Nhập mật khẩu" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={isPending} className="mt-2">
          Đăng nhập
        </Button>
      </Form>
      <Divider className="my-6" />
      <Link href={forgotHref} className="text-sm text-primary hover:underline">
        Quên mật khẩu?
      </Link>
      <div className="mt-6 flex flex-col gap-2">
        <span className="text-xs text-muted">Tài khoản dùng thử, mật khẩu bất kỳ</span>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button key={account.username} size="small" onClick={() => form.setFieldsValue({ username: account.username })}>
              {account.label}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
